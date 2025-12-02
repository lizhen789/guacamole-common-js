import InputStream from "./InputStream";
import ArrayBufferReader from "./ArrayBufferReader";

/**
 * A reader which automatically handles the given input stream, returning
 * strictly text data. Note that this object will overwrite any installed event
 * handlers on the given Guacamole.InputStream.
 */
class StringReader {
  /**
   * The number of bytes remaining for the current codepoint.
   */
  private bytesRemaining = 0;

  /**
   * The current codepoint value, as calculated from bytes read so far.
   */
  private codepoint = 0;
  /**
   * Fired once for every blob of text data received.
   */
  onText?: (text: string) => void;

  /**
   * Fired once this stream is finished and no further data will be written.
   */
  onEnd?: () => void;

  /**
   * @param stream The stream that data will be read from.
   */
  constructor(stream: InputStream) {

    /**
     * Wrapped Guacamole.ArrayBufferReader.
     */
    const arrayReader = new ArrayBufferReader(stream);

    this.bytesRemaining = 0;

    /**
     * The current codepoint value, as calculated from bytes read so far.
     */
    this.codepoint = 0;

    // Set up handlers
    arrayReader.onData = (buffer) => {
      // Convert buffer to text
      const text = this.decodeUtf8(buffer);
      // Call handler, if present
      if (this.onText) {
        this.onText(text);
      }
    };

    arrayReader.onEnd = () => {
      // Call handler, if present
      if (this.onEnd) {
        this.onEnd();
      }
    };

    /**
     * Fired once for every blob of text received.
     */
    this.onText = undefined;

    /**
     * Fired once this stream is finished and no further data will be written.
     */
    this.onEnd = undefined;
  }


  /**
   * Decodes the given UTF-8 data into a Unicode string. The data may end in
   * the middle of a multibyte character.
   *
   * @param buffer Arbitrary UTF-8 data.
   * @return A decoded Unicode string.
   */
  decodeUtf8(buffer: ArrayBuffer): string {
    let text = "";
    const bytes = new Uint8Array(buffer);

    for (let i = 0; i < bytes.length; i++) {
      // Get current byte
      const value = bytes[i];

      // Start new codepoint if nothing yet read
      if (this.bytesRemaining === 0) {
        // 1 byte (0xxxxxxx)
        if ((value | 0x7F) === 0x7F) {
          text += String.fromCharCode(value);
        }
        // 2 byte (110xxxxx)
        else if ((value | 0x1F) === 0xDF) {
          this.bytesRemaining = 1;
          this.codepoint = (value & 0x1F) << 6;
        }
        // 3 byte (1110xxxx)
        else if ((value | 0x0F) === 0xEF) {
          this.bytesRemaining = 2;
          this.codepoint = (value & 0x0F) << 12;
        }
        // 4 byte (11110xxx)
        else if ((value | 0x07) === 0xF7) {
          this.bytesRemaining = 3;
          this.codepoint = (value & 0x07) << 18;
        }
      }
      // Continue multibyte sequence
      else {
        // Add this byte to the current codepoint (must be 10xxxxxx)
        this.codepoint |= (value & 0x3F) << (6 * --this.bytesRemaining);

        // If codepoint complete, emit
        if (this.bytesRemaining === 0) {
          // Handle UTF-16 surrogates for codepoints beyond U+FFFF
          if (this.codepoint <= 0xFFFF) {
            text += String.fromCharCode(this.codepoint);
          } else {
            // Subtract 0x10000 to get the 20-bit value
            const code = this.codepoint - 0x10000;
            // Calculate surrogate pair
            const highSurrogate = (code >>> 10) + 0xD800;
            const lowSurrogate = (code & 0x3FF) + 0xDC00;
            // Add surrogate pair
            text += String.fromCharCode(highSurrogate, lowSurrogate);
          }
          // Reset codepoint
          this.codepoint = 0;
        }
      }
    }
    return text;
  }
}

// 导出类供其他模块使用
export default StringReader;