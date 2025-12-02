/**
 * Parser that decodes UTF-8 text from a series of provided ArrayBuffers.
 * Multi-byte characters that continue from one buffer to the next are handled
 * correctly.
 */
class UTF8Parser {

  /**
   * The number of bytes remaining for the current codepoint.
   *
   * @private
   */
  private bytesRemaining: number = 0;

  /**
   * The current codepoint value, as calculated from bytes read so far.
   *
   * @private
   */
  private codepoint: number = 0;

  constructor() {
  }

  /**
   * Decodes the given UTF-8 data into a Unicode string, returning a string
   * containing all complete UTF-8 characters within the provided data. The
   * data may end in the middle of a multi-byte character, in which case the
   * complete character will be returned from a later call to decode() after
   * enough bytes have been provided.
   *
   * @param buffer
   *     Arbitrary UTF-8 data.
   *
   * @return
   *     The decoded Unicode string.
   */
  decode(buffer: ArrayBuffer): string {
    let text: string = '';

    let bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) {

      // Get current byte
      let value: number = bytes[i];

      // Start new codepoint if nothing yet read
      if (this.bytesRemaining === 0) {

        // 1 byte (0xxxxxxx)
        if ((value | 0x7F) === 0x7F)
          text += String.fromCharCode(value);

        // 2 byte (110xxxxx)
        else if ((value | 0x1F) === 0xDF) {
          this.codepoint = value & 0x1F;
          this.bytesRemaining = 1;
        }

        // 3 byte (1110xxxx)
        else if ((value | 0x0F) === 0xEF) {
          this.codepoint = value & 0x0F;
          this.bytesRemaining = 2;
        }

        // 4 byte (11110xxx)
        else if ((value | 0x07) === 0xF7) {
          this.codepoint = value & 0x07;
          this.bytesRemaining = 3;
        }

        // Invalid byte
        else
          text += '\uFFFD';

      }

      // Continue existing codepoint (10xxxxxx)
      else if ((value | 0x3F) === 0xBF) {

        this.codepoint = (this.codepoint << 6) | (value & 0x3F);
        this.bytesRemaining--;

        // Write codepoint if finished
        if (this.bytesRemaining === 0)
          text += String.fromCharCode(this.codepoint);

      }

      // Invalid byte
      else {
        this.bytesRemaining = 0;
        text += '\uFFFD';
      }

    }
    return text;
  }
}

export default UTF8Parser;