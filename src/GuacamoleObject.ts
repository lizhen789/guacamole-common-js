import InputStream from "./InputStream";
import OutputStream from "./OutputStream";
import Client from "./Client";
import {Mimetype} from "./MimeType";

type BodyCallBack = (stream: InputStream, mimetype: Mimetype) => void;

/**
 * An object used by the Guacamole client to house arbitrarily-many named
 * input and output streams.
 */
class GuacamoleObject {
  public static readonly ROOT_STREAM = "/";
  public static readonly STREAM_INDEX_MIMETYPE = "application/vnd.glyptodon.guacamole.stream-index+json";
  /**
   * Map of stream name to corresponding queue of callbacks.
   */
  private bodyCallbacks: Map<string, Array<BodyCallBack>> = new Map();
  /**
   * The index of this object.
   */
  private readonly index: number;

  /**
   * The client owning this object.
   */
  private client: Client;

  public onUndefine?: () => void;


  /**
   * @constructor
   * @param client The client owning this object.
   * @param index The index of this object.
   */
  constructor(client: Client, index: number) {
    this.client = client;
    this.index = index;
  }

  /**
   * Removes and returns the callback at the head of the callback queue for
   * the stream having the given name.
   */
  dequeueBodyCallback(name: string): BodyCallBack | null {
    const callbacks = this.bodyCallbacks.get(name);
    if (!callbacks || callbacks.length === 0) {
      return null;
    }

    const callback = callbacks.shift();
    if (callbacks.length === 0) {
      this.bodyCallbacks.delete(name);
    }

    return callback ?? null;
  }

  /**
   * Adds the given callback to the tail of the callback queue for the stream
   * having the given name.
   */
  enqueueBodyCallback(name: string, callback: BodyCallBack): void {
    let callbacks = this.bodyCallbacks.get(name);
    if (!callbacks) {
      callbacks = [];
      this.bodyCallbacks.set(name, callbacks);
    }
    callbacks.push(callback);
  }


  onBody(inputStream: InputStream, mimetype: Mimetype, name: string) {
    const callback = this.dequeueBodyCallback(name);
    if (callback) {
      callback(inputStream, mimetype);
    }
  }

  requestInputStream(name: string, callback: BodyCallBack) {
    // Queue body callback if provided
    if (callback) {
      this.enqueueBodyCallback(name, callback);
    }
    // Send request for input stream
    this.client.requestObjectInputStream(this.index, name);
  }


  /**
   * Requests a new output stream with the given name. The callback provided
   * will be invoked once the stream is established.
   *
   * @param name The name of the stream to request.
   * @param mimetype The mimetype of the data to be sent along the stream.
   */
  createOutputStream(mimetype: Mimetype, name: string): OutputStream {
    return this.client.createObjectOutputStream(this.index, mimetype, name);
  }
}

// 导出类供其他模块使用
export default GuacamoleObject;