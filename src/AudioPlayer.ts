import InputStream from "./InputStream";
import RawAudioPlayer from "./RawAudioPlayer";

/**
 * Abstract audio player which accepts, queues and plays back arbitrary audio
 * data. It is up to implementations of this class to provide some means of
 * handling a provided Guacamole.InputStream.
 */
class AudioPlayer {
  /**
   * Notifies this Guacamole.AudioPlayer that all audio up to the current
   * point in time has been given via the underlying stream, and that any
   * difference in time between queued audio data and the current time can be
   * considered latency.
   */
  sync(): void {
    // Default implementation - do nothing
  }

  /**
   * Determines whether the given mimetype is supported by any built-in
   * implementation of Guacamole.AudioPlayer.
   *
   * @param mimetype The mimetype to check.
   * @returns true if the given mimetype is supported by any built-in
   *          Guacamole.AudioPlayer, false otherwise.
   */
  static isSupportedType(mimetype: string): boolean {
    // 这里假设RawAudioPlayer在运行时会被正确加载
    // 在实际实现中，我们需要确保正确引用RawAudioPlayer
    return RawAudioPlayer?.isSupportedType(mimetype) || false;
  }

  /**
   * Returns a list of all mimetypes supported by any built-in
   * Guacamole.AudioPlayer, in rough order of priority.
   *
   * @returns A list of all mimetypes supported by any built-in Guacamole.AudioPlayer,
   *          excluding any parameters.
   */
  static getSupportedTypes(): string[] {
    // 这里假设RawAudioPlayer在运行时会被正确加载
    return RawAudioPlayer?.getSupportedTypes() || [];
  }

  /**
   * Returns an instance of Guacamole.AudioPlayer providing support for the given
   * audio format.
   *
   * @param stream The Guacamole.InputStream to read audio data from.
   * @param mimetype The mimetype of the audio data in the provided stream.
   * @returns A Guacamole.AudioPlayer instance supporting the given mimetype and
   *          reading from the given stream, or null if support for the given mimetype
   *          is absent.
   */
  static getInstance(stream: InputStream, mimetype: string): AudioPlayer | null {
    // Use raw audio player if possible
    if (RawAudioPlayer.isSupportedType(mimetype)) {
      return new RawAudioPlayer(stream, mimetype);
    }

    // No supported audio player found
    return null;
  }
}


// 导出类供其他模块使用
export default AudioPlayer;