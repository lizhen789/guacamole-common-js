import InputStream from "./InputStream";
import VisibleLayer from "./VisibleLayer";


class VideoPlayer {
  isSupportedType(_mimetype: string): boolean {
    return false;
  }

  getSupportedTypes(): string[] {
    return [];
  }

  sync(): void {
    // Default implementation - do nothing
  }

  static getInstance(_stream: InputStream, _layer: VisibleLayer, _mimetype: string): VideoPlayer | null {
    return null;
  }
}

export default VideoPlayer;