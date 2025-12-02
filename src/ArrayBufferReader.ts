import type InputStream from './InputStream';

/**
 * A reader which automatically handles the given input stream, returning
 * strictly received packets as array buffers. Note that this object will
 * overwrite any installed event handlers on the given Guacamole.InputStream.
 */
class ArrayBufferReader {
  /**
   * Fired once for every blob of data received.
   */
  onData?: (buffer: ArrayBuffer) => void;

  /**
   * Fired once this stream is finished and no further data will be written.
   */
  onEnd?: () => void;

  /**
   * @param stream The stream that data will be read from.
   */
  constructor(stream: InputStream) {

    // Receive blobs as array buffers
    stream.onBlob = (data: string) => {
      // Convert to ArrayBuffer
      const binary = atob(data);
      const arrayBuffer = new ArrayBuffer(binary.length);
      const bufferView = new Uint8Array(arrayBuffer);

      for (let i = 0; i < binary.length; i++) {
        bufferView[i] = binary.charCodeAt(i);
      }

      // Call handler, if present
      if (this.onData) {
        this.onData(arrayBuffer);
      }
    };

    // Simply call onend when end received
    stream.onEnd = () => {
      if (this.onEnd) {
        this.onEnd();
      }
    };

    /**
     * Fired once for every blob of data received.
     */
    this.onData = undefined;

    /**
     * Fired once this stream is finished and no further data will be written.
     */
    this.onEnd = undefined;
  }
}

// 导出类供其他模块使用
export default ArrayBufferReader;