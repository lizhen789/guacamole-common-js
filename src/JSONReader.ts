import InputStream from "./InputStream";
import StringReader from "./StringReader";

/**
 * A reader which automatically handles the given input stream, assembling all
 * received blobs into a JavaScript object by appending them to each other, in
 * order, and decoding the result as JSON.
 */
class JSONReader {
  /**
   * The wrapped Guacamole.StringReader.
   */
  private stringReader: StringReader;

  /**
   * All JSON read thus far.
   */
  private json: string = '';

  /**
   * Fired once for every blob of data received.
   *
   * @event
   * @param length The number of characters added.
   */
  onProgress?: (length: number) => void;

  /**
   * Fired once this stream is finished and no further data will be written.
   *
   * @event
   */
  onEnd?: () => void;

  /**
   * @constructor
   * @param stream The stream that JSON will be read from.
   */
  constructor(stream: InputStream) {
    this.stringReader = new StringReader(stream);
    // Append all received text
    this.stringReader.onText = (text) => {
      // Append received text
      this.json += text;

      // Call handler, if present
      if (this.onProgress) {
        this.onProgress(text.length);
      }
    };

    // Simply call onend when end received
    this.stringReader.onEnd = () => {
      if (this.onEnd) {
        this.onEnd();
      }
    };
    this.onProgress = undefined;
    this.onEnd = undefined;
  }

  /**
   * Returns the current length of this Guacamole.JSONReader, in characters.
   *
   * @returns The current length of this Guacamole.JSONReader.
   */
  getLength(): number {
    return this.json.length;
  }

  /**
   * Returns the contents of this Guacamole.JSONReader as a JavaScript
   * object.
   *
   * @returns The contents of this Guacamole.JSONReader, as parsed from the JSON
   *          contents of the input stream.
   * @throws Error If the JSON is invalid or not yet complete.
   */
  getJSON<T = any>(): T {
    try {
      return JSON.parse(this.json) as T;
    } catch (e) {
      throw new Error('Invalid or incomplete JSON');
    }
  }

  /**
   * Attempts to parse the current JSON, returning null if the JSON is
   * invalid or incomplete.
   *
   * @returns The parsed JSON object, or null if parsing fails.
   */
  tryGetJSON<T = any>(): T | null {
    try {
      return this.getJSON<T>();
    } catch {
      return null;
    }
  }

  /**
   * Resets this JSONReader, clearing any accumulated JSON data.
   */
  reset(): void {
    this.json = '';
  }
}

// 导出类供其他模块使用
export default JSONReader;