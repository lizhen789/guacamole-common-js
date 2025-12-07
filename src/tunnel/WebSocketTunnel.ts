import Tunnel, {TunnelState} from "./Tunnel";
import Status, {fromWebSocketCode, StatusCode} from "../Status";
import {InstructionHandlerKey} from "../Client";

class WebSocketTunnel extends Tunnel {
  private socket: WebSocket | undefined;
  private receiveTimeoutHandle: number | null = null;
  private unstableTimeoutHandle: number | null = null;
  private pingIntervalHandle: number | null = null;

  private readonly tunnelURL: string = "";

  public static readonly PING_FREQUENCY: number = 500;

  private wsProtocol: Record<string, string> = {
    "http:": "ws:",
    "https:": "wss:"
  }


  constructor(tunnelURL: string) {
    super();
    // If not already a websocket URL
    if (tunnelURL.substring(0, 3) !== "ws:" && tunnelURL.substring(0, 4) !== "wss:") {

      let protocol = this.wsProtocol[window.location.protocol];

      // If absolute URL, convert to absolute WS URL
      if (tunnelURL.substring(0, 1) === "/") {
        this.tunnelURL = protocol + "//" + window.location.host + tunnelURL;
      }

      // Otherwise, construct absolute from relative URL
      else {
        // Get path from pathname
        let slash = window.location.pathname.lastIndexOf("/");
        let path = window.location.pathname.substring(0, slash + 1);

        // Construct absolute URL
        this.tunnelURL = protocol + "//" + window.location.host + path + tunnelURL;
      }
    }
  }

  resetTimeout() {
    // Get rid of old timeouts (if any)
    this.receiveTimeoutHandle && clearTimeout(this.receiveTimeoutHandle);
    this.unstableTimeoutHandle && clearTimeout(this.unstableTimeoutHandle);

    // Clear unstable status
    if (this.state === TunnelState.UNSTABLE)
      this.setState(TunnelState.OPEN);

    // Set new timeout for tracking overall connection timeout
    this.receiveTimeoutHandle = setTimeout(() => this.closeTunnel(new Status(StatusCode.UPSTREAM_TIMEOUT, "Server timeout.")), this.receiveTimeout);

    // Set new timeout for tracking suspected connection instability
    this.unstableTimeoutHandle = setTimeout(() => this.setState(TunnelState.UNSTABLE), this.unstableThreshold);
  }

  closeTunnel(status: Status) {
    // Get rid of old timeouts (if any)
    this.receiveTimeoutHandle && clearTimeout(this.receiveTimeoutHandle);
    this.unstableTimeoutHandle && clearTimeout(this.unstableTimeoutHandle);

    // Cease connection test pings
    this.pingIntervalHandle && clearInterval(this.pingIntervalHandle);

    // Ignore if already closed
    if (this.state === TunnelState.CLOSED) {
      return;
    }

    // If connection closed abnormally, signal error.
    if (status.code !== StatusCode.SUCCESS && this.onError) {
      this.onError(status);
    }

    // Mark as closed
    this.setState(TunnelState.CLOSED);
    this.socket?.close();
  }

  public sendMessage(...elements: any[]) {


    // Do not attempt to send messages if not connected
    if (!this.isConnected()) {
      return;
    }


    // Do not attempt to send empty messages
    if (elements.length === 0) {
      return;
    }


    /**
     * Converts the given value to a length/string pair for use as an
     * element in a Guacamole instruction.
     *
     * @private
     * @param {*} value
     *     The value to convert.
     *
     * @return {!string}
     *     The converted value.
     */
    function getElement(value: any) {
      let string = String(value);
      return string.length + "." + string;
    }

    // Initialized message with first element
    let message = getElement(elements[0]);

    // Append remaining elements
    for (let i = 1; i < elements.length; i++) {
      message += "," + getElement(elements[i]);
    }
    // Final terminator
    message += ";";

    this.socket?.send(message);
  }

  connect(data?: string) {


    this.resetTimeout();

    // Mark the tunnel as connecting
    this.setState(TunnelState.CONNECTING);

    // Connect socket
    this.socket = new WebSocket(this.tunnelURL + "?" + data, "guacamole");

    this.socket.onopen = () => {
      this.resetTimeout();

      // Ping tunnel endpoint regularly to test connection stability
      this.pingIntervalHandle = setInterval(() => this.sendMessage(Tunnel.INTERNAL_DATA_OPCODE, "ping", new Date().getTime()), WebSocketTunnel.PING_FREQUENCY);
    };

    this.socket.onclose = (event) => {

      // Pull status code directly from closure reason provided by Guacamole
      if (event.reason) {
        this.closeTunnel(new Status(parseInt(event.reason), event.reason));
      }


        // Failing that, derive a Guacamole status code from the WebSocket
      // status code provided by the browser
      else if (event.code) {
        this.closeTunnel(new Status(fromWebSocketCode(event.code)));
      }

      // Otherwise, assume server is unreachable
      else {
        this.closeTunnel(new Status(StatusCode.UPSTREAM_NOT_FOUND));
      }


    };

    this.socket.onmessage = (event) => {

      this.resetTimeout();

      let message: string = event.data;
      let startIndex = 0;
      let elementEnd: number = message.length;

      let elements: string[] = [];

      do {

        // Search for end of length
        let lengthEnd = message.indexOf(".", startIndex);
        if (lengthEnd !== -1) {

          // Parse length
          let length = parseInt(message.substring(elementEnd + 1, lengthEnd));

          // Calculate start of element
          startIndex = lengthEnd + 1;

          // Calculate location of element terminator
          elementEnd = startIndex + length;

        }

        // If no period, incomplete instruction.
        else {
          this.closeTunnel(new Status(StatusCode.SERVER_ERROR, "Incomplete instruction."));
        }


        // We now have enough data for the element. Parse.
        let element = message.substring(startIndex, elementEnd);
        let terminator = message.substring(elementEnd, elementEnd + 1);

        // Add element to array
        elements.push(element);

        // If last element, handle instruction
        if (terminator === ";") {

          // Get opcode
          let opcode = elements.shift();

          // Update state and UUID when first instruction received
          if (this.uuid === null) {

            // Associate tunnel UUID if received
            if (opcode === Tunnel.INTERNAL_DATA_OPCODE) {
              this.setUUID(elements[0]);
            }


            // Tunnel is now open and UUID is available
            this.setState(TunnelState.OPEN);
          }

          // Call instruction handler.
          if (opcode !== Tunnel.INTERNAL_DATA_OPCODE && this.onInstruction) {
            this.onInstruction(opcode as InstructionHandlerKey, elements);
          }


          // Clear elements
          elements.length = 0;

        }

        // Start searching for length at character after
        // element terminator
        startIndex = elementEnd + 1;

      } while (startIndex < message.length);

    };
  }

  disconnect() {
    this.closeTunnel(new Status(StatusCode.SUCCESS, "Manually closed."));
  }
}

export default WebSocketTunnel