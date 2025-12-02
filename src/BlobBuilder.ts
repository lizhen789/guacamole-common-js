class BlobBuilder {
  private readonly blobs: Blob[] = [];
  private readonly mimetype: string;

  constructor(mimetype: string) {
    this.mimetype = mimetype;
  }

  append(blob: Blob | ArrayBuffer | ArrayBufferView): void {
    this.blobs.push(new Blob([blob], {"type": this.mimetype}));
  }

  getBlob(): Blob {
    return new Blob(this.blobs, {"type": this.mimetype});
  }
}

export default BlobBuilder