import Client from "./Client";
import Status from "./Status";

/**
 * Abstract stream which can receive data.
 */
class OutputStream {
  /**
   * The index of this stream.
   */
  index: number;

  /**
   * Fired whenever an acknowledgment is received from the Guacamole server
   * regarding bytes previously written to this stream.
   */
  onAck?: (status: Status) => void;

  /**
   * Writes the given base64-encoded data to this stream as a blob.
   */
  sendBlob: (data: string) => void;

  /**
   * Closes this stream.
   */
  sendEnd: () => void;

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
     * Fired whenever an acknowledgment is received from the Guacamole server
     * regarding bytes previously written to this stream.
     */
    this.onAck = undefined;

    /**
     * Writes the given base64-encoded data to this stream as a blob.
     *
     * @param data The base64-encoded data to send.
     */
    this.sendBlob = (data: string) => {
      client.sendBlob(index, data);
    };

    /**
     * Closes this stream.
     */
    this.sendEnd = () => {
      client.endStream(this.index);
    };
  }
}

// 导出类供其他模块使用
export default OutputStream;