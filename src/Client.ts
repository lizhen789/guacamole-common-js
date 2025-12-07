import {Tunnel} from "./tunnel";
import Display from "./Display";
import OutputStream from "./OutputStream";
import IntegerPool from "./IntegerPool";
import VisibleLayer from "./VisibleLayer";
import AudioPlayer from "./AudioPlayer";
import VideoPlayer from "./VideoPlayer";
import Parser from "./Parser";
import GuacamoleObject from "./GuacamoleObject";
import Status, {StatusCode} from "./Status";
import InputStream from "./InputStream";
import DefaultTransferFunction, {DefaultTransferFunctionType} from "./DefaultTransferFunction";
import Layer from "./Layer";

/**
 * 客户端状态常量
 */
export enum ClientState {
  STATE_IDLE = 0,
  STATE_CONNECTING = 1,
  STATE_WAITING = 2,
  STATE_CONNECTED = 3,
  STATE_DISCONNECTING = 4,
  STATE_DISCONNECTED = 5,
}


export type ClientLayer = {
  width: number,
  height: number,
  url?: string,
  x?: number,
  y?: number,
  z?: number,
  alpha?: number,
  matrix?: number[],
  parent?: number | null,
}
export type StateType = {
  currentState: ClientState,
  currentTimestamp: number,
  layers: Record<number, ClientLayer>
}

export type InstructionHandlerKey =
  "ack"
  | "arc"
  | "argv"
  | "audio"
  | "blob"
  | "body"
  | "cfill"
  | "clip"
  | "clipboard"
  | "close"
  | "copy"
  | "cstroke"
  | "cursor"
  | "curve"
  | "disconnect"
  | "dispose"
  | "distort"
  | "error"
  | "end"
  | "file"
  | "filesystem"
  | "identity"
  | "img"
  | "jpeg"
  | "lfill"
  | "line"
  | "lstroke"
  | "mouse"
  | "move"
  | "name"
  | "nest"
  | "pipe"
  | "png"
  | "pop"
  | "push"
  | "rect"
  | "required"
  | "reset"
  | "set"
  | "shade"
  | "size"
  | "start"
  | "sync"
  | "transfer"
  | "transform"
  | "undefine"
  | "video"

export type InstructionHandlerType = {
  [key in InstructionHandlerKey]: (parameters: string[]) => void
}


/**
 * Guacamole protocol client. Given a {@link Tunnel},
 * automatically handles incoming and outgoing Guacamole instructions via the
 * provided tunnel, updating its display using one or more canvas elements.
 */
class Client {

  private currentState: ClientState = ClientState.STATE_IDLE;


  /**
   * Translation from Guacamole protocol line caps to Layer line caps.
   */
  private lineCap: Record<number, string> = {
    0: "butt",
    1: "round",
    2: "square"
  };

  /**
   * Translation from Guacamole protocol line joins to Layer line joins.
   */
  private lineJoin: Record<number, string> = {
    0: "bevel",
    1: "miter",
    2: "round"
  };

  /**
   * The underlying Guacamole display.
   */
  private readonly display: Display; // Will be Guacamole.Display

  /**
   * All available layers and buffers
   */
  private layers: Record<number, VisibleLayer>; // Will be Guacamole.Display.VisibleLayer|Guacamole.Layer

  /**
   * All audio players currently in use by the client.
   */
  private readonly audioPlayers: Record<number, AudioPlayer>; // Will be Guacamole.AudioPlayer
  /**
   * All video players currently in use by the client.
   */
  private readonly videoPlayers: Record<number, VideoPlayer>; // Will be Guacamole.VideoPlayer


  private parsers: Parser[] = [];
  private streams: InputStream[] = [];
  private objects: GuacamoleObject[] = [];

  private streamIndices = new IntegerPool();

  private outputStreams: OutputStream[] = [];

  /**
   * The underlying Guacamole tunnel.
   */
  private tunnel: Tunnel;

  private currentTimestamp: number = 0;
  private pingInterval: number | null = null;


  /**
   * Event fired when the state of this client changes.
   */
  onStateChange?: (state: ClientState) => void;
  onMultitouch?: (layer: Layer, val: number) => void;
  onArgv?: (stream: InputStream, mimetype: string, name: string) => void;
  onAudio?: (stream: InputStream, mimetype: string) => AudioPlayer;
  onClipboard?: (stream: InputStream, mimetype: string) => void;
  onError?: (status: Status) => void;
  onFile?: (stream: InputStream, mimetype: string, filename: string) => void;
  onFilesystem?: (object: GuacamoleObject, name: string) => void;
  onName?: (name: string) => void;
  onPipe?: (stream: InputStream, mimetype: string, name: string) => void;
  onRequired?: (parameters: string[]) => void;
  onSync?: (timestamp: number) => void;
  onVideo?: (stream: InputStream, layer: Layer, mimetype: string) => VideoPlayer;


  /**
   * @constructor
   * @param tunnel The tunnel to use to send and receive Guacamole instructions.
   */
  constructor(tunnel: Tunnel) {
    this.tunnel = tunnel;
    this.layers = {};
    this.audioPlayers = {};
    this.videoPlayers = {};
    // Initialize display and collections
    this.display = new Display();
    this.tunnel.onInstruction = (opcode: InstructionHandlerKey, parameters: string[]) => {
      let handler = this.instructionHandlers[opcode];
      if (handler)
        handler(parameters);
    };
  }

  /**
   * Disconnects this client from the server.
   */
  disconnect(): void {
    // Only attempt disconnection not disconnected.
    if (this.currentState != ClientState.STATE_DISCONNECTED
      && this.currentState != ClientState.STATE_DISCONNECTING) {

      this.setState(ClientState.STATE_DISCONNECTING);

      // Stop ping
      if (this.pingInterval) {
        window.clearInterval(this.pingInterval);
      }

      // Send disconnect message and disconnect
      this.tunnel.sendMessage("disconnect");
      this.tunnel.disconnect();
      this.setState(ClientState.STATE_DISCONNECTED);
    }
  }

  connect(data?: string): void {
    this.setState(ClientState.STATE_CONNECTING);

    try {
      this.tunnel.connect(data);
    } catch (status) {
      this.setState(ClientState.STATE_IDLE);
      throw status;
    }

    // Ping every 5 seconds (ensure connection alive)
    this.pingInterval = window.setInterval(() => {
      this.tunnel.sendMessage("nop");
    }, 5000);

    this.setState(ClientState.STATE_WAITING);
  }

  /**
   * Sets the current state of this client, firing the appropriate events
   * if the state has changed.
   *
   * @private
   * @param state The new client state.
   */
  setState(state: number): void {
    if (state !== this.currentState) {
      this.currentState = state;
      if (this.onStateChange) {
        this.onStateChange(this.currentState);
      }
    }
  }

  /**
   * Returns whether this client is connected and fully initialized.
   *
   * @returns true if this client is connected, false otherwise.
   */
  isConnected(): boolean {
    return this.currentState == ClientState.STATE_CONNECTED || this.currentState == ClientState.STATE_WAITING;
  }

  getLayerIndex(layer: Layer | null): number | null {
    if (!layer) {
      return null;
    }
    for (const key in this.layers) {
      if (this.layers[key] === layer) {
        return parseInt(key);
      }
    }
    return null;
  }

  getLayer(index: number): VisibleLayer {

    // Get layer, create if necessary
    let layer = this.layers[index];
    if (!layer) {

      // Create layer based on index
      if (index === 0)
        layer = this.display.getDefaultLayer();
      else if (index > 0)
        layer = this.display.createLayer();
      else
        layer = this.display.createBuffer();
      // Add new layer
      this.layers[index] = layer;

    }

    return layer;
  }

  exportState(callback: (state: StateType) => void) {

    // Start with empty state
    const state: StateType = {
      'currentState': this.currentState,
      'currentTimestamp': this.currentTimestamp,
      'layers': {} as Record<number, ClientLayer>
    };
    const layersSnapshot: Record<number, VisibleLayer> = {};

    // Make a copy of all current layers (protocol state)
    for (const key in this.layers) {
      layersSnapshot[key] = this.layers[key];
    }

    // Populate layers once data is available (display state, requires flush)
    this.display.flush(() => {

      // Export each defined layer/buffer
      for (const key in layersSnapshot) {

        const index = parseInt(key);
        const layer = layersSnapshot[key];
        const canvas = layer.toCanvas();

        // Store layer/buffer dimensions
        const exportLayer: ClientLayer = {
          'width': layer.width,
          'height': layer.height
        };

        // Store layer/buffer image data, if it can be generated
        if (layer.width && layer.height) {
          exportLayer.url = canvas.toDataURL('image/png');
        }


        // Add layer properties if not a buffer nor the default layer
        if (index > 0) {
          exportLayer.x = layer.x;
          exportLayer.y = layer.y;
          exportLayer.z = layer.z;
          exportLayer.alpha = layer.alpha;
          exportLayer.matrix = layer.matrix;
          exportLayer.parent = this.getLayerIndex(layer.parent!);
        }

        // Store exported layer
        state.layers[key] = exportLayer;

      }

      // Invoke callback now that the state is ready
      callback(state);

    });
  }

  importState(state: StateType, callback?: any) {


    let key;
    let index;

    this.currentState = state.currentState;
    this.currentTimestamp = state.currentTimestamp;

    // Dispose of all layers
    for (key in this.layers) {
      index = parseInt(key);
      if (index > 0) {
        this.display.dispose(this.layers[key]);
      }
    }

    this.layers = {};

    // Import state of each layer/buffer
    for (key in state.layers) {

      index = parseInt(key);

      let importLayer = state.layers[key];
      let layer = this.getLayer(index);

      // Reset layer size
      this.display.resize(layer, importLayer.width, importLayer.height);

      // Initialize new layer if it has associated data
      if (importLayer.url) {
        this.display.setChannelMask(layer, Layer.SRC);
        this.display.draw(layer, 0, 0, importLayer.url);
      }

      // Set layer-specific properties if not a buffer nor the default layer
      if (index > 0 && importLayer.parent && importLayer.parent >= 0) {

        // Apply layer position and set parent
        let parent = this.getLayer(importLayer.parent);
        this.display.move(layer, parent, importLayer.x, importLayer.y, importLayer.z);

        // Set layer transparency
        this.display.shade(layer, importLayer.alpha);

        // Apply matrix transform
        let matrix = importLayer.matrix;
        if (matrix && matrix.length === 6) {
          this.display.distort(layer, matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
        }
      }
    }

    // Flush changes to display
    this.display.flush(callback);
  }

  getDisplay(): Display {
    return this.display;
  }

  sendSize(width: number, height: number) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }
    this.tunnel.sendMessage("size", width, height);
  }

  sendKeyEvent(pressed: number, keysym: boolean) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }
    this.tunnel.sendMessage("key", keysym, pressed);
  }

  sendMouseState(mouseState: any, applyDisplayScale: any) {

    // Do not send requests if not connected
    if (!this.isConnected())
      return;

    let x = mouseState.x;
    let y = mouseState.y;

    // Translate for display units if requested
    if (applyDisplayScale) {
      x /= this.display.getScale();
      y /= this.display.getScale();
    }

    // Update client-side cursor
    this.display.moveCursor(
      Math.floor(x),
      Math.floor(y)
    );

    // Build mask
    let buttonMask = 0;
    if (mouseState.left) buttonMask |= 1;
    if (mouseState.middle) buttonMask |= 2;
    if (mouseState.right) buttonMask |= 4;
    if (mouseState.up) buttonMask |= 8;
    if (mouseState.down) buttonMask |= 16;

    // Send message
    this.tunnel.sendMessage("mouse", Math.floor(x), Math.floor(y), buttonMask);
  }

  sendTouchState(touchState: any, applyDisplayScale: any) {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }


    let x = touchState.x;
    let y = touchState.y;

    // Translate for display units if requested
    if (applyDisplayScale) {
      x /= this.display.getScale();
      y /= this.display.getScale();
    }

    this.tunnel.sendMessage('touch', touchState.id, Math.floor(x), Math.floor(y), Math.floor(touchState.radiusX), Math.floor(touchState.radiusY), touchState.angle, touchState.force);
  }

  createOutputStream() {
    // Allocate index
    let index = this.streamIndices.next();

    // Return new stream
    return this.outputStreams[index] = new OutputStream(this, index);
  }

  createAudioStream(mimetype: string) {
    let stream = this.createOutputStream();
    this.tunnel.sendMessage("audio", stream.index, mimetype);
    return stream;
  }

  createFileStream(mimetype: string, filename: string) {
    let stream = this.createOutputStream();
    this.tunnel.sendMessage("file", stream.index, mimetype, filename);
    return stream;
  }

  createPipeStream(mimetype: string, name: string) {
    let stream = this.createOutputStream();
    this.tunnel.sendMessage("pipe", stream.index, mimetype, name);
    return stream;
  }

  createClipboardStream(mimetype: string) {
    let stream = this.createOutputStream();
    this.tunnel.sendMessage("clipboard", stream.index, mimetype);
    return stream;
  }

  createArgumentValueStream(mimetype: string, name: string) {
    let stream = this.createOutputStream();
    this.tunnel.sendMessage("argv", stream.index, mimetype, name);
    return stream;
  }

  createObjectOutputStream(index: number, mimetype: string, name: string) {
    let stream = this.createOutputStream();
    this.tunnel.sendMessage("put", index, stream.index, mimetype, name);
    return stream;
  }

  requestObjectInputStream(index: number, name: string) {
    if (!this.isConnected()) {
      return;
    }

    this.tunnel.sendMessage("get", index, name);
  }

  /**
   * Sends an acknowledgement for the given instruction.
   *
   * @param index The index of the instruction to acknowledge.
   * @param message The message to include with the acknowledgement.
   * @param code The status code to include with the acknowledgement.
   */
  sendAck(index: number, message: string, code: number): void {
    // Do not send requests if not connected
    if (!this.isConnected())
      return;

    this.tunnel.sendMessage("ack", index, message, code);
  }


  /**
   * Sends a blob of data to the server.
   *
   * @param index The index of the stream to send the blob to.
   * @param data The base64-encoded data to send.
   */
  sendBlob(index: number, data: string): void {
    if (!this.isConnected()) {
      return;
    }
    this.tunnel.sendMessage("blob", index, data);
  }


  /**
   * Sends an end signal for the given stream index.
   *
   * @param index The index of the stream to end.
   */
  endStream(index: number): void {
    // Do not send requests if not connected
    if (!this.isConnected()) {
      return;
    }

    // Explicitly close stream by sending "end" instruction
    this.tunnel.sendMessage("end", index);

    // Free associated index and stream if they exist
    if (this.outputStreams[index]) {
      this.streamIndices.free(index);
      delete this.outputStreams[index];
    }
  }

  getParser(index: number) {
    let parser = this.parsers[index];

    // If parser not yet created, create it, and tie to the
    // oninstruction handler of the tunnel.
    if (parser == null) {
      parser = this.parsers[index] = new Parser();
      parser.onInstruction = this.tunnel.onInstruction;
    }

    return parser;
  }

  private _ackHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let reason = parameters[1];
    let code: StatusCode = parseInt(parameters[2]) as StatusCode;

    // Get stream
    let stream = this.outputStreams[stream_index];
    if (stream) {

      // Signal ack if handler defined
      if (stream.onAck)
        stream.onAck(new Status(code, reason));

      // If code is an error, invalidate stream if not already
      // invalidated by onack handler
      if (code >= 0x0100 && this.outputStreams[stream_index] === stream) {
        this.streamIndices.free(stream_index);
        delete this.outputStreams[stream_index];
      }
    }
  };
  private _arcHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    let x = parseInt(parameters[1]);
    let y = parseInt(parameters[2]);
    let radius = parseInt(parameters[3]);
    let startAngle = parseFloat(parameters[4]);
    let endAngle = parseFloat(parameters[5]);
    let negative = parseInt(parameters[6]);

    this.display.arc(layer, x, y, radius, startAngle, endAngle, negative != 0);
  };
  private _argvHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let mimetype = parameters[1];
    let name = parameters[2];

    // Create stream
    if (this.onArgv) {
      let stream = this.streams[stream_index] = new InputStream(this, stream_index);
      this.onArgv(stream, mimetype, name);
    }

    // Otherwise, unsupported
    else {
      this.sendAck(stream_index, "Receiving argument values unsupported", 0x0100);
    }
  };
  private _audioHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let mimetype = parameters[1];

    // Create stream
    let stream = this.streams[stream_index] = new InputStream(this, stream_index);

    // Get player instance via callback
    let audioPlayer: AudioPlayer | null = null;
    if (this.onAudio) {
      audioPlayer = this.onAudio(stream, mimetype);
    }


    // If unsuccessful, try to use a default implementation
    if (!audioPlayer) {
      audioPlayer = AudioPlayer.getInstance(stream, mimetype);
    }

    // If we have successfully retrieved an audio player, send success response
    if (audioPlayer) {
      this.audioPlayers[stream_index] = audioPlayer;
      this.sendAck(stream_index, "OK", 0x0000);
    }

    // Otherwise, mimetype must be unsupported
    else {
      this.sendAck(stream_index, "BAD TYPE", 0x030F);
    }
  };
  private _blobHandler = (parameters: string[]) => {
    // Get stream
    let stream_index = parseInt(parameters[0]);
    let data = parameters[1];
    let stream = this.streams[stream_index];

    // Write data
    if (stream && stream.onBlob) {
      stream.onBlob(data);
    }
  };
  private _bodyHandler = (parameters: string[]) => {
    // Get object
    let objectIndex = parseInt(parameters[0]);
    let object = this.objects[objectIndex];

    let streamIndex = parseInt(parameters[1]);
    let mimetype = parameters[2];
    let name = parameters[3];

    // Create stream if handler defined
    if (object && object.onBody) {
      let stream = this.streams[streamIndex] = new InputStream(this, streamIndex);
      object.onBody(stream, mimetype, name);
    }
    // Otherwise, unsupported
    else {
      this.sendAck(streamIndex, "Receipt of body unsupported", 0x0100);
    }
  };
  private _cfillHandler = (parameters: string[]) => {
    let channelMask = parseInt(parameters[0]);
    let layer = this.getLayer(parseInt(parameters[1]));
    let r = parseInt(parameters[2]);
    let g = parseInt(parameters[3]);
    let b = parseInt(parameters[4]);
    let a = parseInt(parameters[5]);

    this.display.setChannelMask(layer, channelMask);
    this.display.fillColor(layer, r, g, b, a);
  };
  private _clipHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));

    this.display.clip(layer);
  };
  private _clipboardHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let mimetype = parameters[1];

    // Create stream 
    if (this.onClipboard) {
      let stream = this.streams[stream_index] = new InputStream(this, stream_index);
      this.onClipboard(stream, mimetype);
    }

    // Otherwise, unsupported
    else {
      this.sendAck(stream_index, "Clipboard unsupported", 0x0100);
    }
  };
  private _closeHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    this.display.close(layer);
  };
  private _copyHandler = (parameters: string[]) => {
    let srcL = this.getLayer(parseInt(parameters[0]));
    let srcX = parseInt(parameters[1]);
    let srcY = parseInt(parameters[2]);
    let srcWidth = parseInt(parameters[3]);
    let srcHeight = parseInt(parameters[4]);
    let channelMask = parseInt(parameters[5]);
    let dstL = this.getLayer(parseInt(parameters[6]));
    let dstX = parseInt(parameters[7]);
    let dstY = parseInt(parameters[8]);

    this.display.setChannelMask(dstL, channelMask);
    this.display.copy(srcL, srcX, srcY, srcWidth, srcHeight, dstL, dstX, dstY);
  };
  private _cstrokeHandler = (parameters: string[]) => {
    let channelMask = parseInt(parameters[0]);
    let layer = this.getLayer(parseInt(parameters[1]));
    let cap = this.lineCap[parseInt(parameters[2])];
    let join = this.lineJoin[parseInt(parameters[3])];
    let thickness = parseInt(parameters[4]);
    let r = parseInt(parameters[5]);
    let g = parseInt(parameters[6]);
    let b = parseInt(parameters[7]);
    let a = parseInt(parameters[8]);

    this.display.setChannelMask(layer, channelMask);
    this.display.strokeColor(layer, cap, join, thickness, r, g, b, a);
  };
  private _cursorHandler = (parameters: string[]) => {
    let cursorHotspotX = parseInt(parameters[0]);
    let cursorHotspotY = parseInt(parameters[1]);
    let srcL = this.getLayer(parseInt(parameters[2]));
    let srcX = parseInt(parameters[3]);
    let srcY = parseInt(parameters[4]);
    let srcWidth = parseInt(parameters[5]);
    let srcHeight = parseInt(parameters[6]);
    this.display.setCursor(cursorHotspotX, cursorHotspotY, srcL, srcX, srcY, srcWidth, srcHeight);
  };
  private _curveHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    let cp1x = parseInt(parameters[1]);
    let cp1y = parseInt(parameters[2]);
    let cp2x = parseInt(parameters[3]);
    let cp2y = parseInt(parameters[4]);
    let x = parseInt(parameters[5]);
    let y = parseInt(parameters[6]);

    this.display.curveTo(layer, cp1x, cp1y, cp2x, cp2y, x, y);
  };
  private _disconnectHandler = (_: string[]) => {
    this.disconnect();
  };
  private _disposeHandler = (parameters: string[]) => {
    let layer_index = parseInt(parameters[0]);

    // If visible layer, remove from parent
    if (layer_index > 0) {

      // Remove from parent
      let layer = this.getLayer(layer_index);
      this.display.dispose(layer);

      // Delete reference
      delete this.layers[layer_index];
    }

    // If buffer, just delete reference
    else if (layer_index < 0) {
      delete this.layers[layer_index];
    }

    // Attempting to dispose the root layer currently has no effect.
  };

  private _distortHandler = (parameters: string[]) => {
    let layer_index = parseInt(parameters[0]);
    let a = parseFloat(parameters[1]);
    let b = parseFloat(parameters[2]);
    let c = parseFloat(parameters[3]);
    let d = parseFloat(parameters[4]);
    let e = parseFloat(parameters[5]);
    let f = parseFloat(parameters[6]);

    // Only valid for visible layers (not buffers)
    if (layer_index >= 0) {
      let layer = this.getLayer(layer_index);
      this.display.distort(layer, a, b, c, d, e, f);
    }
  };
  private _errorHandler = (parameters: string[]) => {
    let reason = parameters[0];
    let code: StatusCode = parseInt(parameters[1]) as StatusCode;

    // Call handler if defined
    if (this.onError) {
      this.onError(new Status(code, reason));
    }

    this.disconnect();
  };
  private _endHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);

    // Get stream
    let stream = this.streams[stream_index];
    if (stream) {

      // Signal end of stream if handler defined
      if (stream.onEnd) {
        stream.onEnd();
      }
      // Invalidate stream
      delete this.streams[stream_index];
    }
  };
  private _fileHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let mimetype = parameters[1];
    let filename = parameters[2];

    // Create stream
    if (this.onFile) {
      let stream = this.streams[stream_index] = new InputStream(this, stream_index);
      this.onFile(stream, mimetype, filename);
    }

    // Otherwise, unsupported
    else {
      this.sendAck(stream_index, "File transfer unsupported", 0x0100);
    }
  };
  private _filesystemHandler = (parameters: string[]) => {
    let objectIndex = parseInt(parameters[0]);
    let name = parameters[1];

    // Create object, if supported
    if (this.onFilesystem) {
      let object = this.objects[objectIndex] = new GuacamoleObject(this, objectIndex);
      this.onFilesystem(object, name);
    }

    // If unsupported, simply ignore the availability of the filesystem

  };
  private _identityHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    this.display.setTransform(layer, 1, 0, 0, 1, 0, 0);
  };
  private _imgHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let channelMask = parseInt(parameters[1]);
    let layer = this.getLayer(parseInt(parameters[2]));
    let mimetype = parameters[3];
    let x = parseInt(parameters[4]);
    let y = parseInt(parameters[5]);

    // Create stream
    let stream = this.streams[stream_index] = new InputStream(this, stream_index);

    // Draw received contents once decoded
    this.display.setChannelMask(layer, channelMask);
    this.display.drawStream(layer, x, y, stream, mimetype);
  };
  private _jpegHandler = (parameters: string[]) => {
    let channelMask = parseInt(parameters[0]);
    let layer = this.getLayer(parseInt(parameters[1]));
    let x = parseInt(parameters[2]);
    let y = parseInt(parameters[3]);
    let data = parameters[4];

    this.display.setChannelMask(layer, channelMask);
    this.display.draw(layer, x, y, "data:image/jpeg;base64," + data);
  };
  private _lfillHandler = (parameters: string[]) => {
    let channelMask = parseInt(parameters[0]);
    let layer = this.getLayer(parseInt(parameters[1]));
    let srcLayer = this.getLayer(parseInt(parameters[2]));

    this.display.setChannelMask(layer, channelMask);
    this.display.fillLayer(layer, srcLayer);
  };
  private _lineHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    let x = parseInt(parameters[1]);
    let y = parseInt(parameters[2]);

    this.display.lineTo(layer, x, y);
  };
  private _lstrokeHandler = (parameters: string[]) => {
    let channelMask = parseInt(parameters[0]);
    let layer = this.getLayer(parseInt(parameters[1]));
    let srcLayer = this.getLayer(parseInt(parameters[2]));

    this.display.setChannelMask(layer, channelMask);
    this.display.strokeLayer(layer, srcLayer);
  };

  private _mouseHandler = (parameters: string[]) => {
    let x = parseInt(parameters[0]);
    let y = parseInt(parameters[1]);

    // Display and move software cursor to received coordinates
    this.display.showCursor(true);
    this.display.moveCursor(x, y);
  };

  private _moveHandler = (parameters: string[]) => {
    let layer_index = parseInt(parameters[0]);
    let parent_index = parseInt(parameters[1]);
    let x = parseInt(parameters[2]);
    let y = parseInt(parameters[3]);
    let z = parseInt(parameters[4]);

    // Only valid for non-default layers
    if (layer_index > 0 && parent_index >= 0) {
      let layer = this.getLayer(layer_index);
      let parent = this.getLayer(parent_index);
      this.display.move(layer, parent, x, y, z);
    }
  };
  private _nameHandler = (parameters: string[]) => {
    if (this.onName) {
      this.onName(parameters[0]);
    }
  };

  private _nestHandler = (parameters: string[]) => {
    let parser = this.getParser(parseInt(parameters[0]));
    parser.receive(parameters[1]);
  };

  private _pipeHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let mimetype = parameters[1];
    let name = parameters[2];

    // Create stream
    if (this.onPipe) {
      let stream = this.streams[stream_index] = new InputStream(this, stream_index);
      this.onPipe(stream, mimetype, name);
    }

    // Otherwise, unsupported
    else {
      this.sendAck(stream_index, "Named pipes unsupported", 0x0100);
    }
  };
  private _pngHandler = (parameters: string[]) => {
    let channelMask = parseInt(parameters[0]);
    let layer = this.getLayer(parseInt(parameters[1]));
    let x = parseInt(parameters[2]);
    let y = parseInt(parameters[3]);
    let data = parameters[4];

    this.display.setChannelMask(layer, channelMask);
    this.display.draw(layer, x, y, "data:image/png;base64," + data);
  };

  private _popHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    this.display.pop(layer);
  };
  private _pushHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    this.display.push(layer);
  };
  private _rectHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    let x = parseInt(parameters[1]);
    let y = parseInt(parameters[2]);
    let w = parseInt(parameters[3]);
    let h = parseInt(parameters[4]);

    this.display.rect(layer, x, y, w, h);
  };

  private _requiredHandler = (parameters: string[]) => {
    if (this.onRequired) {
      this.onRequired(parameters);
    }
  };
  private _resetHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    this.display.reset(layer);
  };
  private _setHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    let name = parameters[1];
    let value = parameters[2];

    // Call property handler if defined
    let handler = this.layerPropertyHandlers[name as keyof typeof this.layerPropertyHandlers];
    if (handler) {
      handler(layer, value);
    }
  };
  private _shadeHandler = (parameters: string[]) => {
    let layer_index = parseInt(parameters[0]);
    let a = parseInt(parameters[1]);

    // Only valid for visible layers (not buffers)
    if (layer_index >= 0) {
      let layer = this.getLayer(layer_index);
      this.display.shade(layer, a);
    }
  };
  private _sizeHandler = (parameters: string[]) => {
    let layer_index = parseInt(parameters[0]);
    let layer = this.getLayer(layer_index);
    let width = parseInt(parameters[1]);
    let height = parseInt(parameters[2]);

    this.display.resize(layer, width, height);
  };
  private _startHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    let x = parseInt(parameters[1]);
    let y = parseInt(parameters[2]);

    this.display.moveTo(layer, x, y);
  };

  private _syncHandler = (parameters: string[]) => {
    let timestamp = parseInt(parameters[0]);

    // Flush display, send sync when done
    this.display.flush(() => {
      // Synchronize all audio players
      for (let index in this.audioPlayers) {
        let audioPlayer = this.audioPlayers[index];
        if (audioPlayer) {
          audioPlayer.sync();
        }
      }

      // Send sync response to server
      if (timestamp !== this.currentTimestamp) {
        this.tunnel.sendMessage("sync", timestamp);
        this.currentTimestamp = timestamp;
      }

    });

    // If received first update, no longer waiting.
    if (this.currentState === ClientState.STATE_WAITING) {
      this.setState(ClientState.STATE_CONNECTED);
    }


    // Call sync handler if defined
    if (this.onSync) {
      this.onSync(timestamp);
    }
  };

  private _transferHandler = (parameters: string[]) => {
    let srcL = this.getLayer(parseInt(parameters[0]));
    let srcX = parseInt(parameters[1]);
    let srcY = parseInt(parameters[2]);
    let srcWidth = parseInt(parameters[3]);
    let srcHeight = parseInt(parameters[4]);
    let function_index: DefaultTransferFunctionType = parseInt(parameters[5]) as DefaultTransferFunctionType;
    let dstL = this.getLayer(parseInt(parameters[6]));
    let dstX = parseInt(parameters[7]);
    let dstY = parseInt(parameters[8]);

    /* SRC */
    if (function_index === 0x3) {
      this.display.put(srcL, srcX, srcY, srcWidth, srcHeight, dstL, dstX, dstY);
    }

    /* Anything else that isn't a NO-OP */
    else if (function_index !== 0x5) {
      this.display.transfer(srcL, srcX, srcY, srcWidth, srcHeight, dstL, dstX, dstY, DefaultTransferFunction[function_index]);
    }

  };

  private _transformHandler = (parameters: string[]) => {
    let layer = this.getLayer(parseInt(parameters[0]));
    let a = parseFloat(parameters[1]);
    let b = parseFloat(parameters[2]);
    let c = parseFloat(parameters[3]);
    let d = parseFloat(parameters[4]);
    let e = parseFloat(parameters[5]);
    let f = parseFloat(parameters[6]);

    this.display.transform(layer, a, b, c, d, e, f);
  };
  private _undefineHandler = (parameters: string[]) => {
    // Get object
    let objectIndex = parseInt(parameters[0]);
    let object = this.objects[objectIndex];

    // Signal end of object definition
    if (object && object.onUndefine) {
      object.onUndefine();
    }
  };
  private _videoHandler = (parameters: string[]) => {
    let stream_index = parseInt(parameters[0]);
    let layer = this.getLayer(parseInt(parameters[1]));
    let mimetype = parameters[2];

    // Create stream
    let stream = this.streams[stream_index] = new InputStream(this, stream_index);

    // Get player instance via callback
    let videoPlayer: VideoPlayer | null = null;
    if (this.onVideo) {
      videoPlayer = this.onVideo(stream, layer, mimetype);
    }


    // If unsuccessful, try to use a default implementation
    if (!videoPlayer) {
      videoPlayer = VideoPlayer.getInstance(stream, layer, mimetype);
    }


    // If we have successfully retrieved an video player, send success response
    if (videoPlayer) {
      this.videoPlayers[stream_index] = videoPlayer;
      this.sendAck(stream_index, "OK", 0x0000);
    }

    // Otherwise, mimetype must be unsupported
    else {
      this.sendAck(stream_index, "BAD TYPE", 0x030F);
    }
  };
  private instructionHandlers: InstructionHandlerType = {
    ack: this._ackHandler,
    arc: this._arcHandler,
    argv: this._argvHandler,
    audio: this._audioHandler,
    blob: this._blobHandler,
    body: this._bodyHandler,
    cfill: this._cfillHandler,
    clip: this._clipHandler,
    clipboard: this._clipboardHandler,
    close: this._closeHandler,
    copy: this._copyHandler,
    cstroke: this._cstrokeHandler,
    cursor: this._cursorHandler,
    curve: this._curveHandler,
    disconnect: this._disconnectHandler,
    dispose: this._disposeHandler,
    distort: this._distortHandler,
    error: this._errorHandler,
    end: this._endHandler,
    file: this._fileHandler,
    filesystem: this._filesystemHandler,
    identity: this._identityHandler,
    img: this._imgHandler,
    jpeg: this._jpegHandler,
    lfill: this._lfillHandler,
    line: this._lineHandler,
    lstroke: this._lstrokeHandler,
    mouse: this._mouseHandler,
    move: this._moveHandler,
    name: this._nameHandler,
    nest: this._nestHandler,
    pipe: this._pipeHandler,
    png: this._pngHandler,
    pop: this._popHandler,
    push: this._pushHandler,
    rect: this._rectHandler,
    required: this._requiredHandler,
    reset: this._resetHandler,
    set: this._setHandler,
    shade: this._shadeHandler,
    size: this._sizeHandler,
    start: this._startHandler,
    sync: this._syncHandler,
    transfer: this._transferHandler,
    transform: this._transformHandler,
    undefine: this._undefineHandler,
    video: this._videoHandler,
  }
  private layerPropertyHandlers = {
    "miter-limit": (layer: Layer, value: string) => {
      this.display.setMiterLimit(layer, parseFloat(value));
    },

    "multi-touch": (layer: Layer, value: string) => {
      // Process "multi-touch" property only for true visible layers (not off-screen buffers)
      if (this.onMultitouch && layer instanceof VisibleLayer) {
        this.onMultitouch(layer, parseInt(value));
      }
    }
  }
}

// 导出类供其他模块使用
export default Client;