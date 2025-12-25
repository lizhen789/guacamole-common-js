import InputStream from './InputStream';
import {Mimetype} from "./MimeType";

/**
 * A reader which automatically handles the given input stream, returning
 * received blobs as a single data URI built over the course of the stream.
 */
class DataURIReader {
  /**
   * The underlying input stream that data will be read from.
   */
  private stream: InputStream;

  /**
   * Current data URI being constructed.
   */
  private uri: string;

  /**
   * Fired once this stream is finished and no further data will be written.
   *
   * @event
   */
  onEnd?: () => void;

  /**
   * @constructor
   * @param stream The stream that data will be read from.
   * @param mimetype The mimetype of the data being received.
   */
  constructor(stream: InputStream, mimetype: Mimetype) {
    this.stream = stream;
    this.uri = 'data:' + mimetype + ';base64,';

    // Receive blobs as array buffers
    this.stream.onBlob = (data) => {
      // Append received base64 data to the URI
      this.uri += data;
    };

    // Forward onend event
    this.stream.onEnd = () => {
      if (this.onEnd) {
        this.onEnd();
      }
    };
  }

  /**
   * Returns the data URI of all data received through the underlying stream
   * thus far.
   *
   * @returns The data URI of all data received through the underlying stream thus
   *          far.
   */
  getURI(): string {
    return this.uri;
  }

  /**
   * Returns whether this DataURIReader has received any data yet.
   *
   * @returns true if data has been received, false otherwise.
   */
  hasData(): boolean {
    // Check if the URI is just the prefix without any actual data
    return this.uri.length > 'data:;base64,'.length;
  }
}

// 导出类供其他模块使用
export default DataURIReader;