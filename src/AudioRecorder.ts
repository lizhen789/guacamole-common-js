import OutputStream from "./OutputStream";
import RawAudioRecorder, {isSupportedType} from "./RawAudioRecorder";

/**
 * Abstract audio recorder which streams arbitrary audio data to an underlying
 * Guacamole.OutputStream.
 */
interface AudioRecorder {
  /**
   * Callback which is invoked when the audio recording process has stopped
   * and the underlying Guacamole stream has been closed normally.
   */
  onClose?: () => void;

  /**
   * Callback which is invoked when the audio recording process cannot
   * continue due to an error, if it has started at all.
   */
  onError?: (error?: Error) => void;
}

/**
 * Returns an instance of Guacamole.AudioRecorder providing support for the
 * given audio format.
 *
 * @param stream The Guacamole.OutputStream to send audio data through.
 * @param mimetype The mimetype of the audio data to be sent to the stream.
 * @returns A Guacamole.AudioRecorder instance supporting the given mimetype and
 *          writing to the given stream, or null if support for the given mimetype
 *          is absent.
 */
const getInstance = (stream: OutputStream, mimetype: string): AudioRecorder | null => {
  // Use raw audio recorder if possible
  if (RawAudioRecorder && isSupportedType(mimetype)) {
    return new RawAudioRecorder(stream, mimetype);
  }

  // No supported audio recorder found
  return null;
}

export {
  getInstance,
  AudioRecorder
}

// 导出类供其他模块使用
export default AudioRecorder;