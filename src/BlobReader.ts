import InputStream from "./InputStream";
import BlobBuilder from "./BlobBuilder";


/**
 * A reader which automatically handles the given input stream, assembling all
 * received blobs into a single blob by appending them to each other in order.
 * Note that this object will overwrite any installed event handlers on the
 * given Guacamole.InputStream.
 */
class BlobReader {
  /**
   * Fired once for every blob of data received.
   */
  onProgress?: (length: number) => void;

  /**
   * Fired once this stream is finished and no further data will be written.
   */
  onEnd?: () => void;

  /**
   * The length of this InputStream in bytes.
   */
  private length: number;


  /**
   * The BlobBuilder instance used to assemble received blobs.
   */
  private blobBuilder: BlobBuilder;

  /**
   * @param stream The stream that data will be read from.
   * @param mimetype The mimetype of the blob being built.
   */
  constructor(stream: InputStream, mimetype: string) {

    /**
     * The length of this Guacamole.InputStream in bytes.
     */
    this.length = 0;


    this.blobBuilder = new BlobBuilder(mimetype);

    // Append received blobs
    stream.onBlob = (data: string) => {
      // Convert to ArrayBuffer
      const binary = atob(data);
      const arrayBuffer = new ArrayBuffer(binary.length);
      const bufferView = new Uint8Array(arrayBuffer);

      for (let i = 0; i < binary.length; i++) {
        bufferView[i] = binary.charCodeAt(i);
      }


      // Add to buffers
      this.blobBuilder.append(arrayBuffer);
      this.length += arrayBuffer.byteLength;

      // Call handler, if present
      if (this.onProgress) {
        this.onProgress(this.length);
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
    this.onProgress = undefined;

    /**
     * Fired once this stream is finished and no further data will be written.
     */
    this.onEnd = undefined;
  }

  /**
   * Returns the current length of this Guacamole.InputStream, in bytes.
   * @return The current length of this Guacamole.InputStream.
   */
  getLength(): number {
    return this.length;
  }

  /**
   * Returns the contents of this Guacamole.BlobReader as a Blob.
   * @return The contents of this Guacamole.BlobReader.
   */
  getBlob(): Blob {
    return this.blobBuilder.getBlob()
  }
}

// 导出类供其他模块使用
export default BlobReader;