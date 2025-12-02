import Client from "./Client";

/**
 * An input stream abstraction used by the Guacamole client to facilitate
 * transfer of files or other binary data.
 */
class InputStream {
  /**
   * The index of this stream.
   */
  index: number;

  /**
   * Called when a blob of data is received.
   */
  onBlob?: (data: string) => void;

  /**
   * Called when this stream is closed.
   */
  onEnd?: () => void;
  /**
   * Acknowledges the receipt of a blob.
   *
   * @param message A human-readable message describing the error or status.
   * @param code The error code, if any, or 0 for success.
   */
  sendAck: (message: string, status: number) => void;

  /**
   * @param client The client owning this stream.
   * @param index The index of this stream.
   */
  constructor(client: Client, index: number) {

    /**
     * The index of this stream.
     */
    this.index = index;

    /**
     * Called when a blob of data is received.
     */
    this.onBlob = undefined;

    /**
     * Called when this stream is closed.
     */
    this.onEnd = undefined;

    /**
     * Acknowledges the receipt of a blob.
     *
     * @param message A human-readable message describing the error or status.
     * @param code The error code, if any, or 0 for success.
     */
    this.sendAck = (message: string, code: number) => {
      client.sendAck(this.index, message, code);
    };
  }
}

// 导出类供其他模块使用
export default InputStream;