import OutputStream from "./OutputStream";
import RawAudioRecorder from "./RawAudioRecorder";

/**
 * Abstract audio recorder which streams arbitrary audio data to an underlying
 * Guacamole.OutputStream.
 */
class AudioRecorder {
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

  /**
   * Determines whether the given mimetype is supported by any built-in
   * implementation of Guacamole.AudioRecorder.
   *
   * @param mimetype The mimetype to check.
   * @returns true if the given mimetype is supported by any built-in
   *          Guacamole.AudioRecorder, false otherwise.
   */
  static isSupportedType(mimetype: string): boolean {
    // 这里假设RawAudioRecorder在运行时会被正确加载
    return RawAudioRecorder?.isSupportedType(mimetype) || false;
  }

  /**
   * Returns a list of all mimetypes supported by any built-in
   * Guacamole.AudioRecorder, in rough order of priority.
   *
   * @returns A list of all mimetypes supported by any built-in
   *          Guacamole.AudioRecorder, excluding any parameters.
   */
  static getSupportedTypes(): string[] {
    // 这里假设RawAudioRecorder在运行时会被正确加载
    return RawAudioRecorder?.getSupportedTypes() || [];
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
  static getInstance(stream: OutputStream, mimetype: string): AudioRecorder | null {
    // Use raw audio recorder if possible
    if (RawAudioRecorder && RawAudioRecorder.isSupportedType(mimetype)) {
      return new RawAudioRecorder(stream, mimetype);
    }

    // No supported audio recorder found
    return null;
  }
}

// 导出类供其他模块使用
export default AudioRecorder;