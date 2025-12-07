import {TunnelState,Tunnel} from "./Tunnel";
import Status, {fromHTTPCode, StatusCode} from "../Status";
import {InstructionHandlerKey} from "../Client";

class HTTPTunnel extends Tunnel {
  private readonly TUNNEL_CONNECT: string;
  private readonly TUNNEL_READ: string;
  private readonly TUNNEL_WRITE: string;
  public static readonly POLLING_ENABLED: number = 1;
  public static readonly POLLING_DISABLED: number = 0;
  public static readonly PING_FREQUENCY: number = 500;
  public static readonly TUNNEL_TOKEN_HEADER: string = 'Guacamole-Tunnel-Token';
  private pollingMode: number = HTTPTunnel.POLLING_ENABLED;
  private sendingMessages: boolean = false;
  private outputMessageBuffer: string = "";
  private readonly withCredentials: boolean = false;

  private receiveTimeoutHandle: number | null = null;
  private unstableTimeoutHandle: number | null = null;
  private pingIntervalHandle: number | null = null;

  private readonly extraHeaders: Record<string, string> = {};

  private tunnelSessionToken: string | null = null;

  private request_id: number = 0;

  constructor(tunnelURL: string, crossDomain: boolean = false, extraTunnelHeaders: Record<string, string> = {}) {
    super();
    this.TUNNEL_CONNECT = tunnelURL + "?connect";
    this.TUNNEL_READ = tunnelURL + "?read:";
    this.TUNNEL_WRITE = tunnelURL + "?write:";
    this.withCredentials = crossDomain
    this.extraHeaders = extraTunnelHeaders;
  }

  private addExtraHeaders(request: XMLHttpRequest, headers: Record<string, any>) {
    for (let name in headers) {
      request.setRequestHeader(name, headers[name]);
    }
  }

  public resetTimeout() {

    // Get rid of old timeouts (if any)
    this.receiveTimeoutHandle && clearTimeout(this.receiveTimeoutHandle);
    this.unstableTimeoutHandle && clearTimeout(this.unstableTimeoutHandle);

    // Clear unstable status
    if (this.state === TunnelState.UNSTABLE) {
      this.setState(TunnelState.OPEN);
    }


    // Set new timeout for tracking overall connection timeout
    this.receiveTimeout = setTimeout(() => this.closeTunnel(new Status(StatusCode.UPSTREAM_TIMEOUT, "Server timeout.")), this.receiveTimeout);

    // Set new timeout for tracking suspected connection instability
    this.unstableTimeoutHandle = setTimeout(() => this.setState(TunnelState.UNSTABLE), this.unstableThreshold);
  }

  private closeTunnel(status: Status) {
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

      // Ignore RESOURCE_NOT_FOUND if we've already connected, as that
      // only signals end-of-stream for the HTTP tunnel.
      if (this.state === TunnelState.CONNECTING || status.code !== StatusCode.RESOURCE_NOT_FOUND) {
        this.onError(status);
      }
    }

    // Reset output message buffer
    this.sendingMessages = false;

    // Mark as closed
    this.setState(TunnelState.CLOSED);
  }

  public sendMessage(...elements: string[]) {
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
     * @param value
     *     The value to convert.
     *
     * @return {!string}
     *     The converted value.
     */
    const getElement = (value: any): string => {
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

    // Add message to buffer
    this.outputMessageBuffer += message;

    // Send if not currently sending
    if (!this.sendingMessages) {
      this.sendPendingMessages();
    }
  }

  private sendPendingMessages() {


    // Do not attempt to send messages if not connected
    if (!this.isConnected()) {
      return;
    }


    if (this.outputMessageBuffer.length > 0) {

      this.sendingMessages = true;

      let request: XMLHttpRequest = new XMLHttpRequest();
      request.open("POST", this.TUNNEL_WRITE + this.uuid);
      request.withCredentials = this.withCredentials;
      this.addExtraHeaders(request, this.extraHeaders);
      request.setRequestHeader("Content-type", "application/octet-stream");
      request.setRequestHeader(HTTPTunnel.TUNNEL_TOKEN_HEADER, this.tunnelSessionToken ?? "");

      // Once response received, send next queued event.
      request.onreadystatechange = () => {
        if (request.readyState === 4) {

          this.resetTimeout();

          // If an error occurs during send, handle it
          if (request.status !== 200) {
            this.handleHTTPTunnelError(request);
          }
          // Otherwise, continue the send loop
          else {
            this.sendPendingMessages();
          }
        }
      };

      request.send(this.outputMessageBuffer);
      this.outputMessageBuffer = ""; // Clear buffer

    } else {
      this.sendingMessages = false;
    }
  }

  public handleHTTPTunnelError(request: XMLHttpRequest) {
    // Pull status code directly from headers provided by Guacamole
    let headerCode = request.getResponseHeader("Guacamole-Status-Code");
    let code = parseInt(headerCode || "0");
    if (code) {
      let message = request.getResponseHeader("Guacamole-Error-Message");
      this.closeTunnel(new Status(code, message ?? ""));
    }

      // Failing that, derive a Guacamole status code from the HTTP status
    // code provided by the browser
    else if (request.status) {
      this.closeTunnel(new Status(fromHTTPCode(request.status), request.statusText));
    }
    // Otherwise, assume server is unreachable
    else {
      this.closeTunnel(new Status(StatusCode.UPSTREAM_NOT_FOUND));
    }
  }

  public handleResponse(request: XMLHttpRequest) {


    let interval: number | null = null;
    let nextRequest: XMLHttpRequest | null = null;

    let dataUpdateEvents = 0;

    // The location of the last element's terminator
    let elementEnd = -1;

    // Where to start the next length search or the next element
    let startIndex = 0;

    // Parsed elements
    let elements: string[] = [];

    const parseResponse = () => {

      // Do not handle responses if not connected
      if (!this.isConnected()) {

        // Clean up interval if polling
        interval && clearInterval(interval);

        return;
      }

      // Do not parse response yet if not ready
      if (request.readyState < 2) return;

      // Attempt to read status
      let status;
      try {
        status = request.status;
      }

        // If status could not be read, assume successful.
      catch (e) {
        status = 200;
      }

      // Start next request as soon as possible IF request was successful
      if (!nextRequest && status === 200) {
        nextRequest = this.makeRequest();
      }

      // Parse stream when data is received and when complete.
      if (request.readyState === 3 || request.readyState === 4) {

        this.resetTimeout();

        // Also poll every 30ms (some browsers don't repeatedly call onreadystatechange for new data)
        if (this.pollingMode === HTTPTunnel.POLLING_ENABLED) {
          if (request.readyState === 3 && !interval) {
            interval = setInterval(parseResponse, 30);
          } else if (request.readyState === 4 && interval) {
            clearInterval(interval);
          }
        }

        // If canceled, stop transfer
        if (request.status === 0) {
          this.disconnect();
          return;
        }

        // Halt on error during request
        else if (request.status !== 200) {
          this.handleHTTPTunnelError(request);
          return;
        }

        // Attempt to read in-progress data
        let current;
        try {
          current = request.responseText;
        }

          // Do not attempt to parse if data could not be read
        catch (e) {
          return;
        }

        // While search is within currently received data
        while (elementEnd < current.length) {

          // If we are waiting for element data
          if (elementEnd >= startIndex) {

            // We now have enough data for the element. Parse.
            let element = current.substring(startIndex, elementEnd);
            let terminator = current.substring(elementEnd, elementEnd + 1);

            // Add element to array
            elements.push(element);

            // If last element, handle instruction
            if (terminator === ";") {

              // Get opcode
              let opcode = elements.shift();

              // Call instruction handler.
              if (this.onInstruction && opcode) {
                this.onInstruction(opcode as InstructionHandlerKey, elements);
              }
              // Clear elements
              elements.length = 0;

            }

            // Start searching for length at character after
            // element terminator
            startIndex = elementEnd + 1;

          }

          // Search for end of length
          let lengthEnd = current.indexOf(".", startIndex);
          if (lengthEnd !== -1) {

            // Parse length
            let length = parseInt(current.substring(elementEnd + 1, lengthEnd));

            // If we're done parsing, handle the next response.
            if (length === 0) {

              // Clean up interval if polling
              if (interval) {
                clearInterval(interval);
              }

              // Clean up object
              request.onreadystatechange = null;
              request.abort();

              // Start handling next request
              if (nextRequest) {
                this.handleResponse(nextRequest);
              }


              // Done parsing
              break;

            }

            // Calculate start of element
            startIndex = lengthEnd + 1;

            // Calculate location of element terminator
            elementEnd = startIndex + length;

          }

            // If no period yet, continue search when more data
          // is received
          else {
            startIndex = current.length;
            break;
          }

        } // end parse loop

      }

    }

    // If response polling enabled, attempt to detect if still
    // necessary (via wrapping parseResponse())
    if (this.pollingMode === HTTPTunnel.POLLING_ENABLED) {
      request.onreadystatechange = () => {

        // If we receive two or more readyState==3 events,
        // there is no need to poll.
        if (request.readyState === 3) {
          dataUpdateEvents++;
          if (dataUpdateEvents >= 2) {
            this.pollingMode = HTTPTunnel.POLLING_DISABLED;
            request.onreadystatechange = parseResponse;
          }
        }
        parseResponse();
      };
    }

    // Otherwise, just parse
    else {
      request.onreadystatechange = parseResponse;
    }
    parseResponse();
  }

  private makeRequest() {
    // Make request, increment request ID
    let request = new XMLHttpRequest();
    request.open("GET", this.TUNNEL_READ + this.uuid + ":" + (this.request_id++));
    request.setRequestHeader(HTTPTunnel.TUNNEL_TOKEN_HEADER, this.tunnelSessionToken ?? "");
    request.withCredentials = this.withCredentials;
    this.addExtraHeaders(request, this.extraHeaders);
    request.send(null);

    return request;
  }

  public connect(data: string) {


    // Start waiting for connect
    this.resetTimeout();

    // Mark the tunnel as connecting
    this.setState(TunnelState.CONNECTING);

    // Start tunnel and connect
    let request = new XMLHttpRequest();
    request.onreadystatechange = () => {

      if (request.readyState !== 4) {
        return;
      }

      // If failure, throw error
      if (request.status !== 200) {
        this.handleHTTPTunnelError(request);
        return;
      }

      // Reset timeout
      this.resetTimeout();

      // Get UUID and HTTP-specific tunnel session token from response
      this.setUUID(request.responseText);
      this.tunnelSessionToken = request.getResponseHeader(HTTPTunnel.TUNNEL_TOKEN_HEADER);

      // Fail connect attempt if token is not successfully assigned
      if (!this.tunnelSessionToken) {
        this.closeTunnel(new Status(StatusCode.UPSTREAM_NOT_FOUND));
        return;
      }

      // Mark as open
      this.setState(TunnelState.OPEN);

      // Ping tunnel endpoint regularly to test connection stability
      this.pingIntervalHandle = setInterval(() => this.sendMessage("nop"), HTTPTunnel.PING_FREQUENCY);

      // Start reading data
      this.handleResponse(this.makeRequest());

    };

    request.open("POST", this.TUNNEL_CONNECT, true);
    request.withCredentials = this.withCredentials;
    this.addExtraHeaders(request, this.extraHeaders);
    request.setRequestHeader("Content-type", "application/x-www-form-urlencoded; charset=UTF-8");
    request.send(data);
  }

  disconnect() {
    this.closeTunnel(new Status(StatusCode.SUCCESS, "Manually closed."));
  }

}


export default HTTPTunnel