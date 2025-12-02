import type OutputStream from "./OutputStream";
import Status from "./Status";

/**
 * A writer which automatically writes to the given output stream with arbitrary
 * binary data, supplied as ArrayBuffers.
 */
class ArrayBufferWriter {
  /**
   * Fired for received data, if acknowledged by the server.
   */
  onAck?: (status: Status) => void;

  public static DEFAULT_BLOB_LENGTH = 6048

  private stream: OutputStream;

  /**
   * @param stream The stream that data will be written to.
   */
  constructor(stream: OutputStream) {

    // Simply call onAck for acknowledgements
    stream.onAck = (status: Status) => {
      if (this.onAck) {
        this.onAck(status);
      }
    };
    this.stream = stream;

    /**
     * Fired for received data, if acknowledged by the server.
     */
    this.onAck = undefined;
  }

  /**
   * Encodes the given data as base64, sending it as a blob. The data must
   * be small enough to fit into a single blob instruction.
   *
   * @param bytes The data to send.
   */
  private _sendBlob(bytes: Uint8Array): void {
    let binary = "";

    // Produce binary string from bytes in buffer
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    // Send as base64
    this.stream.sendBlob(btoa(binary));
  }

  /**
   * Sends the given data.
   *
   * @param data The data to send.
   */
  sendData(data?: ArrayBuffer | ArrayBufferView): void {
    if (!data) {
      return;
    }
    const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer,
      data instanceof ArrayBuffer ? 0 : data.byteOffset,
      data instanceof ArrayBuffer ? data.byteLength : data.byteLength);

    // If small enough to fit into single instruction, send as-is
    if (bytes.length <= this.blobLength) {
      this._sendBlob(bytes);
    }
    // Otherwise, send as multiple instructions
    else {
      for (let offset = 0; offset < bytes.length; offset += this.blobLength) {
        this._sendBlob(bytes.subarray(offset, Math.min(offset + this.blobLength, bytes.length)));
      }
    }
  }

  /**
   * Signals that no further text will be sent, effectively closing the
   * stream.
   */
  sendEnd(): void {
    this.stream.sendEnd();
  }

  get blobLength(): number {
    return ArrayBufferWriter.DEFAULT_BLOB_LENGTH;
  }
}

// 导出类供其他模块使用
export default ArrayBufferWriter;