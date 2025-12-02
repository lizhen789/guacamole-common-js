import {InstructionHandlerKey} from "./Client";

/**
 *
 * Simple Guacamole protocol parser that invokes an oninstruction event when
 * full instructions are available from data received via receive().
 */
class Parser {
  /**
   * Current buffer of received data. This buffer grows until a full
   * element is available. After a full element is available, that element
   * is flushed into the element buffer.
   */
  private buffer: string;

  /**
   * Buffer of all received, complete elements. After an entire instruction
   * is read, this buffer is flushed, and a new instruction begins.
   */
  private elementBuffer: string[];

  /**
   * The location of the last element's terminator
   */
  private elementEnd: number;

  /**
   * Where to start the next length search or the next element
   */
  private startIndex: number;

  /**
   * Fired once for every complete Guacamole instruction received, in order.
   */
  onInstruction?: (opcode: InstructionHandlerKey, parameters: string[]) => void;

  /**
   * @constructor
   */
  constructor() {
    this.buffer = "";
    this.elementBuffer = [];
    this.elementEnd = -1;
    this.startIndex = 0;
    this.onInstruction = undefined;
  }

  /**
   * Appends the given instruction data packet to the internal buffer of
   * this Guacamole.Parser, executing all completed instructions at
   * the beginning of this buffer, if any.
   *
   * @param packet The instruction data to receive.
   */
  receive(packet: string): void {
    // Truncate buffer as necessary
    if (this.startIndex > 4096 && this.elementEnd >= this.startIndex) {
      this.buffer = this.buffer.substring(this.startIndex);

      // Reset parse relative to truncation
      this.elementEnd -= this.startIndex;
      this.startIndex = 0;
    }

    // Append data to buffer
    this.buffer += packet;

    // While search is within currently received data
    while (this.elementEnd < this.buffer.length) {
      // If we are waiting for element data
      if (this.elementEnd >= this.startIndex) {
        // We now have enough data for the element. Parse.
        const element = this.buffer.substring(this.startIndex, this.elementEnd);
        const terminator = this.buffer.substring(this.elementEnd, this.elementEnd + 1);

        // Add element to array
        this.elementBuffer.push(element);

        // If last element, handle instruction
        if (terminator === ";") {
          // Get opcode
          const opcode = this.elementBuffer.shift();

          // Fire instruction event
          if (this.onInstruction && opcode !== undefined) {
            this.onInstruction(opcode as InstructionHandlerKey, this.elementBuffer);
          }

          // Clear element buffer
          this.elementBuffer = [];
        } else if (terminator != ',') {
          throw new Error("Illegal terminator.");
        }


        // Start searching for length at next character
        this.startIndex = this.elementEnd + 1;
      }

      // If we are waiting for length
      // Look for end of length
      const lengthEnd = this.buffer.indexOf('.', this.startIndex);

      // If length found
      if (lengthEnd !== -1) {
        // Parse length
        const length_str = this.buffer.substring(this.elementEnd + 1, lengthEnd);
        const length = parseInt(length_str, 10);

        if (isNaN(length))
          throw new Error("Non-numeric character in element length.");
        // Calculate start of element
        this.startIndex = lengthEnd + 1;

        // Calculate location of element terminator
        this.elementEnd = this.startIndex + length;
      }
      // If no period yet, stop searching
      else {
        this.startIndex = this.buffer.length;
        break;
      }
    }
  }

  /**
   * Returns the current position within the stream. This position is the
   * offset of the last byte parsed as part of an instruction. Bytes after
   * this position are part of an incomplete instruction.
   *
   * @returns The current position within the stream, or the current buffer
   *          length if no instructions have been completely parsed yet.
   */
  getPosition(): number {
    // If we have parsed at least one element, return the position of the last element
    if (this.startIndex > 0) {
      return this.startIndex;
    }

    // Otherwise, return the current buffer length
    return this.buffer.length;
  }

  /**
   * Returns the number of bytes currently in the buffer, waiting to be
   * parsed as complete instructions.
   *
   * @returns The number of bytes currently in the buffer.
   */
  getBufferedBytes(): number {
    return this.buffer.length;
  }
}

// 导出类供其他模块使用
export default Parser;