import InputStream from "./InputStream";
import RawAudioPlayer, {isSupportedType} from "./RawAudioPlayer";
import {Mimetype} from "./MimeType";

/**
 * Abstract audio player which accepts, queues and plays back arbitrary audio
 * data. It is up to implementations of this class to provide some means of
 * handling a provided Guacamole.InputStream.
 */
interface AudioPlayer {
  /**
   * Notifies this Guacamole.AudioPlayer that all audio up to the current
   * point in time has been given via the underlying stream, and that any
   * difference in time between queued audio data and the current time can be
   * considered latency.
   */
  sync(): void
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
const getInstance = (stream: InputStream, mimetype: Mimetype): AudioPlayer | null => {
  // Use raw audio player if possible
  if (isSupportedType(mimetype)) {
    return new RawAudioPlayer(stream, mimetype);
  }

  // No supported audio player found
  return null;
}

export {
  getInstance,
  AudioPlayer
}

// 导出类供其他模块使用
export default AudioPlayer;