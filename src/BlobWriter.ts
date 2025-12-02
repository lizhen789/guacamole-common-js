import OutputStream from "./OutputStream";
import ArrayBufferWriter from "./ArrayBufferWriter";
import Status from "./Status";


/**
 * A writer which automatically writes to the given output stream with the
 * contents of provided Blob objects.
 */
class BlobWriter {
  private arrayBufferWriter: ArrayBufferWriter;

  onAck?: (status: Status) => void;
  oncomplete?: (blob: Blob) => void;
  onProgress?: (blob: Blob, offset: number) => void;
  onError?: (blob: Blob, offset: number, error: DOMException | null) => void;

  /**
   * Signals that no further blobs will be sent, effectively closing the stream.
   */
  sendEnd(): void {
    this.arrayBufferWriter.sendEnd();
  }

  constructor(stream: OutputStream) {
    this.arrayBufferWriter = new ArrayBufferWriter(stream);

    // Forward acknowledgments
    this.arrayBufferWriter.onAck = (status: Status) => {
      if (this.onAck) {
        this.onAck(status);
      }
    };
  }

  /**
   * Browser-independent implementation of Blob.slice().
   */
  private slice(blob: Blob, start: number, end: number): Blob {
    // Use prefixed implementations if necessary
    const sliceImplementation = (blob.slice).bind(blob);

    const length = end - start;

    // The old Blob.slice() was length-based (not end-based)
    if (length !== end) {
      // If the result of the slice() call matches the expected length, trust that result
      const sliceResult = sliceImplementation(start, length);
      if (sliceResult.size === length) {
        return sliceResult;
      }
    }

    // Otherwise, use the most-recent standard: end-based slice()
    return sliceImplementation(start, end);
  }

  /**
   * Sends the contents of the given blob over the underlying stream.
   */
  sendBlob(blob: Blob): void {
    let offset = 0;
    const reader = new FileReader();

    /**
     * Reads the next chunk of the blob.
     */
    const readNextChunk = () => {
      // If no further chunks remain, inform of completion and stop
      if (offset >= blob.size) {
        if (this.oncomplete) {
          this.oncomplete(blob);
        }
        return;
      }

      // Obtain reference to next chunk as a new blob
      const chunk = this.slice(blob, offset, offset + this.arrayBufferWriter.blobLength);
      offset += this.arrayBufferWriter.blobLength;

      // Attempt to read the blob contents into a new array buffer
      reader.readAsArrayBuffer(chunk);
    };

    // Send each chunk over the stream, continue reading the next chunk
    reader.onload = (e: ProgressEvent<FileReader>) => {
      if (e.target && e.target.result) {
        // 确保结果是 ArrayBuffer 类型再传递给 sendData
        if (e.target.result instanceof ArrayBuffer) {
          this.arrayBufferWriter.sendData(e.target.result);
        } else {
          // 如果是字符串，则转换为 ArrayBuffer
          const encoder = new TextEncoder();
          this.arrayBufferWriter.sendData(encoder.encode(e.target.result).buffer);
        }

        // Continue sending more chunks after the latest chunk is
        // acknowledged
        this.arrayBufferWriter.onAck = (status) => {

          if (this.onAck)
            this.onAck(status);

          // Abort transfer if an error occurs
          if (status.isError())
            return;

          // Inform of blob upload progress via progress events
          if (this.onProgress)
            this.onProgress(blob, offset - this.arrayBufferWriter.blobLength);

          // Queue the next chunk for reading
          readNextChunk();
        };
      }
    };

    // Handle any errors during reading
    reader.onerror = () => {
      // Fire error event, including the context of the error
      if (this.onError)
        this.onError(blob, offset, reader.error);
    };

    // Start reading the first chunk
    readNextChunk();
  }


}

// 导出类供其他模块使用
export default BlobWriter;