import AudioContextFactory from "./AudioContextFactory";
import RawAudioFormat from "./RawAudioFormat";
import AudioRecorder from "./AudioRecorder";
import ArrayBufferWriter from "./ArrayBufferWriter";
import OutputStream from "./OutputStream";
import Status, {StatusCode} from "./Status";

/**
 * Implementation of Guacamole.AudioRecorder providing support for raw PCM format
 * audio. This recorder relies only on the Web Audio API and does not require any
 * browser-level support for its audio formats.
 */
class RawAudioRecorder implements AudioRecorder {

  /**
   * The size of audio buffer to request from the Web Audio API when
   * recording or processing audio, in sample-frames. This must be a power of
   * two between 256 and 16384 inclusive, as required by
   * AudioContext.createScriptProcessor().
   */
  private readonly BUFFER_SIZE: number = 2048;

  /**
   * The window size to use when applying Lanczos interpolation, commonly
   * denoted by the variable "a".
   * See: https://en.wikipedia.org/wiki/Lanczos_resampling
   */
  private readonly LANCZOS_WINDOW_SIZE: number = 3;

  /**
   * The format of audio this recorder will encode.
   */
  private readonly format: RawAudioFormat;

  /**
   * An instance of a Web Audio API AudioContext object, or null if the
   * Web Audio API is not supported.
   */
  private readonly context: AudioContext;

  /**
   * Guacamole.ArrayBufferWriter wrapped around the audio output stream
   * provided when this Guacamole.RawAudioRecorder was created.
   */
  private writer: ArrayBufferWriter;

  /**
   * The type of typed array that will be used to represent each audio packet
   * internally. This will be either Int8Array or Int16Array, depending on
   * whether the raw audio format is 8-bit or 16-bit.
   */
  private readonly SampleArray: Int8ArrayConstructor | Int16ArrayConstructor;

  /**
   * The maximum absolute value of any sample within a raw audio packet sent
   * by this audio recorder. This depends only on the size of each sample,
   * and will be 128 for 8-bit audio and 32768 for 16-bit audio.
   */
  private readonly maxSampleValue: number;

  /**
   * The total number of audio samples read from the local audio input device
   * over the life of this audio recorder.
   */
  private readSamples: number = 0;

  /**
   * The total number of audio samples written to the underlying Guacamole
   * connection over the life of this audio recorder.
   */
  private writtenSamples: number = 0;

  /**
   * The audio stream provided by the browser, if allowed. If no stream has
   * yet been received, this will be null.
   */
  private mediaStream: MediaStream | null = null;

  /**
   * The source node providing access to the local audio input device.
   */
  private source: MediaStreamAudioSourceNode | null = null;

  /**
   * The script processing node which receives audio input from the media
   * stream source node as individual audio buffers.
   */
  private processor: ScriptProcessorNode | null = null;

  /**
   * @param stream The Guacamole.OutputStream to send audio data through.
   * @param mimetype The mimetype of the audio data to be sent to the stream, which
   *                 must be a "audio/L8" or "audio/L16" mimetype with appropriate
   *                 parameters.
   */
  constructor(stream: OutputStream, mimetype: string) {
    const format = RawAudioFormat.parse(mimetype);
    if (!format) {
      throw new Error(`Unsupported mimetype: ${mimetype}`);
    }
    this.format = format;
    let context = AudioContextFactory.getAudioContext();
    if (!context) {
      throw new Error("AudioContext not supported.");
    }
    this.context = context;
    this.writer = new ArrayBufferWriter(stream);


    // Initialize sample array type and value range
    if (this.format?.bytesPerSample === 1) {
      this.SampleArray = window.Int8Array;
      this.maxSampleValue = 128;
    } else {
      this.SampleArray = window.Int16Array;
      this.maxSampleValue = 32768;
    }

    // Once audio stream is successfully open, request and begin reading audio
    this.writer.onAck = (status: Status) => this.audioStreamAcknowledged(status);
  }
  onClose(){

  }
  onError(){

  }

  /**
   * The normalized sinc function. The normalized sinc function is defined as
   * 1 for x=0 and sin(PI * x) / (PI * x) for all other values of x.
   *
   * See: https://en.wikipedia.org/wiki/Sinc_function
   *
   * @param x
   *     The point at which the normalized sinc function should be computed.
   *
   * @returns
   *     The value of the normalized sinc function at x.
   */
  private sinc(x: number): number {
    // The value of sinc(0) is defined as 1
    if (x === 0) {
      return 1;
    }

    // Otherwise, normlized sinc(x) is sin(PI * x) / (PI * x)
    const piX = Math.PI * x;
    return Math.sin(piX) / piX;
  }

  /**
   * Calculates the value of the Lanczos kernal at point x for a given window
   * size. See: https://en.wikipedia.org/wiki/Lanczos_resampling
   *
   * @param x
   *     The point at which the value of the Lanczos kernel should be
   *     computed.
   *
   * @param a
   *     The window size to use for the Lanczos kernel.
   *
   * @returns
   *     The value of the Lanczos kernel at the given point for the given
   *     window size.
   */
  private lanczos(x: number, a: number): number {
    // Lanczos is sinc(x) * sinc(x / a) for -a < x < a ...
    if (-a < x && x < a)
      return this.sinc(x) * this.sinc(x / a);

    // ... and 0 otherwise
    return 0;
  }

  /**
   * Determines the value of the waveform represented by the audio data at
   * the given location. If the value cannot be determined exactly as it does
   * not correspond to an exact sample within the audio data, the value will
   * be derived through interpolating nearby samples.
   *
   * @param audioData
   *     An array of audio data, as returned by AudioBuffer.getChannelData().
   *
   * @param t
   *     The relative location within the waveform from which the value
   *     should be retrieved, represented as a floating point number between
   *     0 and 1 inclusive, where 0 represents the earliest point in time and
   *     1 represents the latest.
   *
   * @returns
   *     The value of the waveform at the given location.
   */
  private interpolateSample(audioData: Float32Array, t: number): number {
    // Convert [0, 1] range to [0, audioData.length - 1]
    const index = (audioData.length - 1) * t;

    // Determine the start and end points for the summation used by the
    // Lanczos interpolation algorithm (see: https://en.wikipedia.org/wiki/Lanczos_resampling)
    const start = Math.floor(index) - this.LANCZOS_WINDOW_SIZE + 1;
    const end = Math.floor(index) + this.LANCZOS_WINDOW_SIZE;

    // Calculate the value of the Lanczos interpolation function for the
    // required range
    let sum = 0;
    for (let i = start; i <= end; i++) {
      sum += (audioData[i] || 0) * this.lanczos(index - i, this.LANCZOS_WINDOW_SIZE);
    }

    return sum;
  }

  /**
   * Converts the given AudioBuffer into an audio packet, ready for streaming
   * along the underlying output stream. Unlike the raw audio packets used by
   * this audio recorder, AudioBuffers require floating point samples and are
   * split into isolated planes of channel-specific data.
   *
   * @param audioBuffer
   *     The Web Audio API AudioBuffer that should be converted to a raw
   *     audio packet.
   *
   * @returns
   *     A new raw audio packet containing the audio data from the provided
   *     AudioBuffer.
   */
  private toSampleArray(audioBuffer: AudioBuffer): Int8Array | Int16Array {
    // Track overall amount of data read
    const inSamples = audioBuffer.length;
    this.readSamples += inSamples;

    // Calculate the total number of samples that should be written as of
    // the audio data just received and adjust the size of the output
    // packet accordingly
    const expectedWrittenSamples = Math.round(this.readSamples * this.format.rate / audioBuffer.sampleRate);
    const outSamples = expectedWrittenSamples - this.writtenSamples;

    // Update number of samples written
    this.writtenSamples += outSamples;

    // Get array for raw PCM storage
    const data = new this.SampleArray(outSamples * this.format.channels);

    // Convert each channel
    for (let channel = 0; channel < this.format.channels; channel++) {
      const audioData = audioBuffer.getChannelData(channel);

      // Fill array with data from audio buffer channel
      let offset = channel;
      for (let i = 0; i < outSamples; i++) {
        data[offset] = this.interpolateSample(audioData, i / (outSamples - 1)) * this.maxSampleValue;
        offset += this.format.channels;
      }
    }

    return data;
  }

  /**
   * getUserMedia() callback which handles successful retrieval of an
   * audio stream (successful start of recording).
   *
   * @param stream
   *     A MediaStream which provides access to audio data read from the
   *     user's local audio input device.
   */
  private streamReceived(stream: MediaStream): void {
    // Create processing node which receives appropriately-sized audio buffers
    this.processor = this.context.createScriptProcessor(this.BUFFER_SIZE, this.format.channels, this.format.channels);
    this.processor.connect(this.context.destination);

    // Send blobs when audio buffers are received
    this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
      this.writer.sendData(this.toSampleArray(e.inputBuffer).buffer as ArrayBuffer);
    };

    // Connect processing node to user's audio input source
    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.processor);

    // Attempt to explicitly resume AudioContext, as it may be paused
    // by default
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    // Save stream for later cleanup
    this.mediaStream = stream;
  }

  /**
   * getUserMedia() callback which handles audio recording denial. The
   * underlying Guacamole output stream is closed, and the failure to
   * record is noted using onerror.
   */
  private streamDenied(): void {
    // Simply end stream if audio access is not allowed
    this.writer.sendEnd();

    // Notify of closure
    if (this.onError) {
      this.onError();
    }
  }

  /**
   * Requests access to the user's microphone and begins capturing audio. All
   * received audio data is resampled as necessary and forwarded to the
   * Guacamole stream underlying this Guacamole.RawAudioRecorder. This
   * function must be invoked ONLY ONCE per instance of
   * Guacamole.RawAudioRecorder.
   */
  private beginAudioCapture(): void {
    // Attempt to retrieve an audio input stream from the browser
    navigator.mediaDevices.getUserMedia({'audio': true})
      .then((stream: MediaStream) => this.streamReceived(stream))
      .catch(() => this.streamDenied());
  }

  /**
   * Stops capturing audio, if the capture has started, freeing all associated
   * resources. If the capture has not started, this function simply ends the
   * underlying Guacamole stream.
   */
  private stopAudioCapture(): void {
    // Disconnect media source node from script processor
    if (this.source) {
      this.source.disconnect();
    }

    // Disconnect associated script processor node
    if (this.processor) {
      this.processor.disconnect();
    }


    // Stop capture
    if (this.mediaStream) {
      const tracks = this.mediaStream.getTracks();
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].stop();
      }
    }

    // Remove references to now-unneeded components
    this.processor = null;
    this.source = null;
    this.mediaStream = null;

    // End stream
    this.writer.sendEnd();
  }

  /**
   * Handles the successful acknowledgment of audio stream by the Guacamole
   * server by starting audio capture if not already started.
   *
   * @param status
   *     The status of the Guacamole stream, as returned by the Guacamole
   *     server.
   */
  private audioStreamAcknowledged(status: Status): void {
    // Begin capture if successful response and not yet started
    if (status.code === StatusCode.SUCCESS && !this.mediaStream) {
      this.beginAudioCapture();
    }


    // Otherwise stop capture and cease handling any further acks
    else {
      // Stop capturing audio
      this.stopAudioCapture();
      this.writer.onAck = undefined;

      // Notify if stream has closed normally
      if (status.code === StatusCode.RESOURCE_CLOSED) {
        if (this.onClose) {
          this.onClose();
        }
      }

      // Otherwise notify of closure due to error
      else {
        if (this.onError) {
          this.onError();
        }
      }
    }
  }

}


/**
 * Determines whether the given mimetype is supported by
 * Guacamole.RawAudioRecorder.
 *
 * @param mimetype
 *     The mimetype to check.
 *
 * @returns
 *     true if the given mimetype is supported by Guacamole.RawAudioRecorder,
 *     false otherwise.
 */
const isSupportedType = (mimetype: string): boolean => {
  // No supported types if no Web Audio API
  if (!AudioContextFactory.getAudioContext())
    return false;

  return RawAudioFormat.parse(mimetype) !== null;
}

/**
 * Returns a list of all mimetypes supported by Guacamole.RawAudioRecorder. Only
 * the core mimetypes themselves will be listed. Any mimetype parameters, even
 * required ones, will not be included in the list. For example, "audio/L8" is
 * a raw audio mimetype that may be supported, but it is invalid without
 * additional parameters. Something like "audio/L8;rate=44100" would be valid,
 * however (see https://tools.ietf.org/html/rfc4856).
 *
 * @returns
 *     A list of all mimetypes supported by Guacamole.RawAudioRecorder,
 *     excluding any parameters. If the necessary JavaScript APIs for recording
 *     raw audio are absent, this list will be empty.
 */
const getSupportedTypes = (): string[] => {
  // No supported types if no Web Audio API
  if (!AudioContextFactory.getAudioContext())
    return [];

  // We support 8-bit and 16-bit raw PCM
  return [
    'audio/L8',
    'audio/L16'
  ];
}
export {
  isSupportedType,
  getSupportedTypes
}
// 导出类供其他模块使用
export default RawAudioRecorder;
