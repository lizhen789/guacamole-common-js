import InputStream from "./InputStream";
import Layer from "./Layer";
import {Mimetype} from "./MimeType";


class VideoPlayer {
  isSupportedType(_mimetype: Mimetype): boolean {
    return false;
  }

  getSupportedTypes(): string[] {
    return [];
  }

  sync(): void {
    // Default implementation - do nothing
  }

  static getInstance(_stream: InputStream, _layer: Layer, _mimetype: Mimetype): VideoPlayer | null {
    return null;
  }
}

export default VideoPlayer;