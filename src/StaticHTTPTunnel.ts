import Tunnel, {TunnelState} from "./Tunnel";
import Parser from "./Parser";
import Status, {fromHTTPCode} from "./Status";

class StaticHTTPTunnel extends Tunnel {
  private xhr: XMLHttpRequest | null = null;
  private readonly extraHeaders: Record<string, string> = {};
  private readonly url: string;
  private readonly crossDomain: boolean;

  constructor(url: string, crossDomain: boolean = false, extraTunnelHeaders: Record<string, string> = {}) {
    super();
    this.extraHeaders = extraTunnelHeaders;
    this.url = url;
    this.crossDomain = crossDomain;
  }

  private addExtraHeaders(request: XMLHttpRequest, headers: Record<string, string>) {
    for (let key in headers) {
      request.setRequestHeader(key, headers[key]);
    }
  }

  sendMessage(..._elements: string[]) {

  }

  connect(_data: string) {


    // Ensure any existing connection is killed
    this.disconnect();

    // Connection is now starting
    this.setState(TunnelState.CONNECTING);

    // Start a new connection
    this.xhr = new XMLHttpRequest();
    this.xhr.open('GET', this.url);
    this.xhr.withCredentials = this.crossDomain;
    this.addExtraHeaders(this.xhr, this.extraHeaders);
    this.xhr.responseType = 'text';
    this.xhr.send(null);

    let offset = 0;

    // Create Guacamole protocol parser specifically for this connection
    let parser = new Parser();

    // Invoke tunnel's oninstruction handler for each parsed instruction
    parser.onInstruction = (opcode, args) => {
      if (this.onInstruction) {
        this.onInstruction(opcode, args);
      }
    };

    const _xhr = this.xhr;
    // Continuously parse received data
    this.xhr.onreadystatechange = () => {

      // Parse while data is being received
      if (_xhr.readyState === 3 || _xhr.readyState === 4) {

        // Connection is open
        this.setState(TunnelState.OPEN);

        let buffer = _xhr.responseText;
        let length = buffer.length;

        // Parse only the portion of data which is newly received
        if (offset < length) {
          parser.receive(buffer.substring(offset));
          offset = length;
        }

      }

      // Clean up and close when done
      if (_xhr.readyState === 4) {
        this.disconnect();
      }
    };

    // Reset state and close upon error
    this.xhr.onerror = () => {

      // Fail if file could not be downloaded via HTTP
      if (this.onError) {
        this.onError(new Status(fromHTTPCode(_xhr.status), _xhr.statusText));
      }

      this.disconnect();
    };

  }

  disconnect() {
    // Abort and dispose of XHR if a request is in progress
    if (this.xhr) {
      this.xhr.abort();
      this.xhr = null;
    }

    // Connection is now closed
    this.setState(TunnelState.CLOSED);
  }
}

export default StaticHTTPTunnel