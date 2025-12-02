import OutputStream from "./OutputStream";
import ArrayBufferWriter from "./ArrayBufferWriter";
import Status from "./Status";

/**
 * A writer which automatically writes to the given output stream with text data.
 * Note that this object will overwrite any installed event handlers on the
 * given Guacamole.OutputStream.
 */
class StringWriter {
  /**
   * Fired for received data, if acknowledged by the server.
   */
  onAck?: (status: Status) => void;

  /**
   * Wrapped Guacamole.ArrayBufferWriter.
   *
   * @private
   * @type {!ArrayBufferWriter}
   */
  private arrayWriter: ArrayBufferWriter;
  /**
   * Internal buffer for UTF-8 output.
   *
   * @private
   * @type {!Uint8Array}
   */
  private buffer: Uint8Array = new Uint8Array(8192);
  /**
   * The number of bytes currently in the buffer.
   *
   * @private
   * @type {!number}
   */
  private length: number = 0;

  /**
   * @param stream The stream that data will be written to.
   */
  constructor(stream: OutputStream) {

    /**
     * The underlying stream that data will be written to.
     */
    this.arrayWriter = new ArrayBufferWriter(stream);

    // Simply call onAck for acknowledgements
    this.arrayWriter.onAck = (status: Status) => {
      if (this.onAck) {
        this.onAck(status);
      }
    };

    /**
     * Fired for received data, if acknowledged by the server.
     */
    this.onAck = undefined;
  }

  /**
   * Writes the given text. If the text cannot be sent immediately, it will be
   * buffered.
   *
   * @param text The text to write.
   */
  sendText(text: string): void {
    if (!text.length) {
      return;
    }
    // Send as blob
    this.arrayWriter.sendData(this.encodeUTF8(text));
  }

  /**
   * Signals that no further text will be sent, effectively closing the
   * stream.
   */
  sendEnd(): void {
    this.arrayWriter.sendEnd();
  }

  private encodeUTF8(text: string) {
    // Fill buffer with UTF-8
    for (let i = 0; i < text.length; i++) {
      let codepoint = text.charCodeAt(i);
      this.appendUtf8(codepoint);
    }

    // Flush buffer
    if (length > 0) {
      let out_buffer = this.buffer.subarray(0, length);
      length = 0;
      return out_buffer;
    }
    return void 0;
  }


  /**
   * Appends a single Unicode character to the current buffer, resizing the
   * buffer if necessary. The character will be encoded as UTF-8.
   *
   * @private
   * @param {!number} codepoint
   *     The codepoint of the Unicode character to append.
   */
  private appendUtf8(codepoint: number) {

    let mask;
    let bytes;

    // 1 byte
    if (codepoint <= 0x7F) {
      mask = 0x00;
      bytes = 1;
    }

    // 2 byte
    else if (codepoint <= 0x7FF) {
      mask = 0xC0;
      bytes = 2;
    }

    // 3 byte
    else if (codepoint <= 0xFFFF) {
      mask = 0xE0;
      bytes = 3;
    }

    // 4 byte
    else if (codepoint <= 0x1FFFFF) {
      mask = 0xF0;
      bytes = 4;
    }

    // If invalid codepoint, append replacement character
    else {
      this.appendUtf8(0xFFFD);
      return;
    }

    // Offset buffer by size
    this.expand(bytes);
    let offset = this.length - 1;

    // Add trailing bytes, if any
    for (let i = 1; i < bytes; i++) {
      this.buffer[offset--] = 0x80 | (codepoint & 0x3F);
      codepoint >>= 6;
    }

    // Set initial byte
    this.buffer[offset] = mask | codepoint;

  }

  /**
   * Expands the size of the underlying buffer by the given number of bytes,
   * updating the length appropriately.
   *
   * @private
   * @param {!number} bytes
   *     The number of bytes to add to the underlying buffer.
   */
  private expand(bytes: number) {
    // Resize buffer if more space needed
    if (this.length + bytes >= this.buffer.length) {
      let new_buffer = new Uint8Array((this.length + bytes) * 2);
      new_buffer.set(this.buffer);
      this.buffer = new_buffer;
    }

    this.length += bytes;
  }
}

// 导出类供其他模块使用
export default StringWriter;