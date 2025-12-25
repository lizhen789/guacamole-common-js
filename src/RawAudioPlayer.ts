import AudioPlayer from "./AudioPlayer";
import RawAudioFormat from "./RawAudioFormat";
import ArrayBufferReader from "./ArrayBufferReader";
import InputStream from "./InputStream";
import AudioContextFactory from "./AudioContextFactory";
import {Mimetype} from "./MimeType"

type AudioBufferSource = {
  noteOn: (time: number) => void
} & AudioBufferSourceNode

/**
 * Implementation of Guacamole.AudioPlayer providing support for raw PCM format
 * audio. This player relies only on the Web Audio API and does not require any
 * browser-level support for its audio formats.
 */
class RawAudioPlayer implements AudioPlayer {

  /**
   * The format of audio this player will decode.
   */
  private readonly format: RawAudioFormat;

  /**
   * An instance of a Web Audio API AudioContext object, or null if the
   * Web Audio API is not supported.
   */
  private readonly context: AudioContext;

  /**
   * The earliest possible time that the next packet could play without
   * overlapping an already-playing packet, in seconds. Note that while this
   * value is in seconds, it is not an integer value and has microsecond
   * resolution.
   */
  private nextPacketTime: number;

  /**
   * Guacamole.ArrayBufferReader wrapped around the audio input stream
   * provided with this Guacamole.RawAudioPlayer was created.
   */
  private reader: ArrayBufferReader;

  /**
   * The minimum size of an audio packet split by splitAudioPacket(), in
   * seconds. Audio packets smaller than this will not be split, nor will the
   * split result of a larger packet ever be smaller in size than this
   * minimum.
   */
  private readonly MIN_SPLIT_SIZE: number = 0.02;

  /**
   * The maximum amount of latency to allow between the buffered data stream
   * and the playback position, in seconds. Initially, this is set to
   * roughly one third of a second.
   */
  private maxLatency: number = 0.3;

  /**
   * The type of typed array that will be used to represent each audio packet
   * internally. This will be either Int8Array or Int16Array, depending on
   * whether the raw audio format is 8-bit or 16-bit.
   */
  private readonly SampleArray: Int8ArrayConstructor | Int16ArrayConstructor;

  /**
   * The maximum absolute value of any sample within a raw audio packet
   * received by this audio player. This depends only on the size of each
   * sample, and will be 128 for 8-bit audio and 32768 for 16-bit audio.
   */
  private readonly maxSampleValue: number;

  /**
   * The queue of all pending audio packets, as an array of sample arrays.
   * Audio packets which are pending playback will be added to this queue for
   * further manipulation prior to scheduling via the Web Audio API. Once an
   * audio packet leaves this queue and is scheduled via the Web Audio API,
   * no further modifications can be made to that packet.
   */
  private packetQueue: (Int8Array | Int16Array)[] = [];

  /**
   * @param stream The Guacamole.InputStream to read audio data from.
   * @param mimetype The mimetype of the audio data in the provided stream, which
   *                 must be a "audio/L8" or "audio/L16" mimetype with appropriate
   *                 parameters.
   */
  constructor(stream: InputStream, mimetype: Mimetype) {
    const format = RawAudioFormat.parse(mimetype);
    if (!format) {
      throw new Error(`Unsupported audio format: ${mimetype}`);
    }
    this.format = format;
    const context = AudioContextFactory.getAudioContext();
    if (!context) {
      throw new Error("Web Audio API not supported");
    }
    this.context = context;
    this.nextPacketTime = this.context.currentTime;
    this.reader = new ArrayBufferReader(stream);

    // Initialize sample array type and value range
    if (this.format.bytesPerSample === 1) {
      this.SampleArray = Int8Array;
      this.maxSampleValue = 128;
    } else {
      this.SampleArray = Int16Array;
      this.maxSampleValue = 32768;
    }

    // Defer playback of received audio packets slightly
    this.reader.onData = (data: ArrayBuffer) => this.playReceivedAudio(data);
  }

  /**
   * Given an array of audio packets, returns a single audio packet
   * containing the concatenation of those packets.
   *
   * @param packets
   *     The array of audio packets to concatenate.
   *
   * @returns
   *     A single audio packet containing the concatenation of all given
   *     audio packets. If no packets are provided, this will be undefined.
   */
  private joinAudioPackets(packets: (Int8Array | Int16Array)[]): Int8Array | Int16Array | undefined {
    // Do not bother joining if one or fewer packets are in the queue
    if (packets.length <= 1) {
      return packets[0];
    }

    // Determine total sample length of the entire queue
    let totalLength = 0;
    packets.forEach((packet) => {
      totalLength += packet.length;
    });

    // Append each packet within queue
    let offset = 0;
    const joined = new this.SampleArray(totalLength);
    packets.forEach((packet) => {
      joined.set(packet, offset);
      offset += packet.length;
    });

    return joined;
  }

  /**
   * Given a single packet of audio data, splits off an arbitrary length of
   * audio data from the beginning of that packet, returning the split result
   * as an array of two packets. The split location is determined through an
   * algorithm intended to minimize the liklihood of audible clicking between
   * packets. If no such split location is possible, an array containing only
   * the originally-provided audio packet is returned.
   *
   * @param data
   *     The audio packet to split.
   *
   * @returns
   *     An array of audio packets containing the result of splitting the
   *     provided audio packet. If splitting is possible, this array will
   *     contain two packets. If splitting is not possible, this array will
   *     contain only the originally-provided packet.
   */
  private splitAudioPacket(data: Int8Array | Int16Array): (Int8Array | Int16Array)[] {
    let minValue = Number.MAX_VALUE;
    let optimalSplitLength = data.length;

    // Calculate number of whole samples in the provided audio packet AND
    // in the minimum possible split packet
    const samples = Math.floor(data.length / this.format.channels);
    const minSplitSamples = Math.floor(this.format.rate * this.MIN_SPLIT_SIZE);

    // Calculate the beginning of the "end" of the audio packet
    const start = Math.max(
      this.format.channels * minSplitSamples,
      this.format.channels * (samples - minSplitSamples)
    );

    // For all samples at the end of the given packet, find a point where
    // the perceptible volume across all channels is lowest (and thus is
    // the optimal point to split)
    for (let offset = start; offset < data.length; offset += this.format.channels) {
      // Calculate the sum of all values across all channels (the result
      // will be proportional to the average volume of a sample)
      let totalValue = 0;
      for (let channel = 0; channel < this.format.channels; channel++) {
        totalValue += Math.abs(data[offset + channel]);
      }

      // If this is the smallest average value thus far, set the split
      // length such that the first packet ends with the current sample
      if (totalValue <= minValue) {
        optimalSplitLength = offset + this.format.channels;
        minValue = totalValue;
      }
    }

    // If packet is not split, return the supplied packet untouched
    if (optimalSplitLength === data.length)
      return [data];

    // Otherwise, split the packet into two new packets according to the
    // calculated optimal split length
    return [
      new this.SampleArray(data.buffer.slice(0, optimalSplitLength * this.format.bytesPerSample) as ArrayBuffer),
      new this.SampleArray(data.buffer.slice(optimalSplitLength * this.format.bytesPerSample) as ArrayBuffer)
    ];
  }

  /**
   * Pushes the given packet of audio data onto the playback queue. Unlike
   * other private functions within Guacamole.RawAudioPlayer, the type of the
   * ArrayBuffer packet of audio data here need not be specific to the type
   * of audio (as with SampleArray). The ArrayBuffer type provided by a
   * Guacamole.ArrayBufferReader, for example, is sufficient. Any necessary
   * conversions will be performed automatically internally.
   *
   * @param data
   *     A raw packet of audio data that should be pushed onto the audio
   *     playback queue.
   */
  private pushAudioPacket(data: ArrayBuffer): void {
    this.packetQueue.push(new this.SampleArray(data));
  }

  /**
   * Shifts off and returns a packet of audio data from the beginning of the
   * playback queue. The length of this audio packet is determined
   * dynamically according to the click-reduction algorithm implemented by
   * splitAudioPacket().
   *
   * @returns
   *     A packet of audio data pulled from the beginning of the playback
   *     queue. If there is no audio currently in the playback queue, this
   *     will be null.
   */
  private shiftAudioPacket(): Int8Array | Int16Array | null {
    // Flatten data in packet queue
    const data = this.joinAudioPackets(this.packetQueue);
    if (!data) {
      return null;
    }

    // Pull an appropriate amount of data from the front of the queue
    this.packetQueue = this.splitAudioPacket(data);
    const packet = this.packetQueue.shift();

    return packet ?? null;
  }

  /**
   * Converts the given audio packet into an AudioBuffer, ready for playback
   * by the Web Audio API. Unlike the raw audio packets received by this
   * audio player, AudioBuffers require floating point samples and are split
   * into isolated planes of channel-specific data.
   *
   * @param data
   *     The raw audio packet that should be converted into a Web Audio API
   *     AudioBuffer.
   *
   * @returns
   *     A new Web Audio API AudioBuffer containing the provided audio data,
   *     converted to the format used by the Web Audio API.
   */
  private toAudioBuffer(data: Int8Array | Int16Array): AudioBuffer {
    // Calculate total number of samples
    const samples = data.length / this.format.channels;

    // Determine exactly when packet CAN play
    const packetTime = this.context!.currentTime;
    if (this.nextPacketTime < packetTime) {
      this.nextPacketTime = packetTime;
    }

    // Get audio buffer for specified format
    const audioBuffer = this.context!.createBuffer(this.format.channels, samples, this.format.rate);

    // Convert each channel
    for (let channel = 0; channel < this.format.channels; channel++) {
      const audioData = audioBuffer.getChannelData(channel);

      // Fill audio buffer with data for channel
      let offset = channel;
      for (let i = 0; i < samples; i++) {
        audioData[i] = data[offset] / this.maxSampleValue;
        offset += this.format.channels;
      }
    }

    return audioBuffer;
  }

  /**
   * Plays the given audio packet. Handles setting up the Web Audio API
   * source node and scheduling the packet for playback.
   *
   * @param data
   *     The raw audio packet that should be played.
   */
  private playAudioPacket(data: Int8Array | Int16Array): void {

    // Determine exactly when packet CAN play
    const packetTime = this.context.currentTime;
    if (this.nextPacketTime < packetTime) {
      this.nextPacketTime = packetTime;
    }

    // Set up buffer source
    const source: AudioBufferSource = this.context.createBufferSource() as AudioBufferSource;
    source.connect(this.context.destination);

    // Use start() instead of noteOn() if necessary
    if (!source.start) {
      source.start = source.noteOn;
    }

    // Schedule packet
    source.buffer = this.toAudioBuffer(data);
    source.start(this.nextPacketTime);

    // Update timeline by duration of scheduled packet
    this.nextPacketTime += data.length / this.format.channels / this.format.rate;
  }

  /**
   * Handles the deferred playback of received audio packets.
   *
   * @param data
   *     A raw packet of audio data that should be played.
   */
  private playReceivedAudio(data: ArrayBuffer): void {
    // Push received samples onto queue
    this.pushAudioPacket(data);

    // Shift off an arbitrary packet of audio data from the queue (this may
    // be different in size from the packet just pushed)
    const packet = this.shiftAudioPacket();
    if (!packet) {
      return;
    }

    // Play packet immediately if context is available
    this.playAudioPacket(packet);
  }

  /** @override */
  sync(): void {
    // Calculate elapsed time since last sync
    const now = this.context.currentTime;

    // Reschedule future playback time such that playback latency is
    // bounded within a reasonable latency threshold
    this.nextPacketTime = Math.min(this.nextPacketTime, now + this.maxLatency);
  }


}


/**
 * Determines whether the given mimetype is supported by
 * Guacamole.RawAudioPlayer.
 *
 * @param mimetype
 *     The mimetype to check.
 *
 * @returns
 *     true if the given mimetype is supported by Guacamole.RawAudioPlayer,
 *     false otherwise.
 */
const isSupportedType = (mimetype: Mimetype): boolean => {
  // No supported types if no Web Audio API
  if (!AudioContextFactory.getAudioContext()) {
    return false;
  }

  return RawAudioFormat.parse(mimetype) !== null;
}


/**
 * Returns a list of all mimetypes supported by Guacamole.RawAudioPlayer. Only
 * the core mimetypes themselves will be listed. Any mimetype parameters, even
 * required ones, will not be included in the list. For example, "audio/L8" is
 * a raw audio mimetype that may be supported, but it is invalid without
 * additional parameters. Something like "audio/L8;rate=44100" would be valid,
 * however (see https://tools.ietf.org/html/rfc4856).
 *
 * @returns
 *     A list of all mimetypes supported by Guacamole.RawAudioPlayer, excluding
 *     any parameters. If the necessary JavaScript APIs for playing raw audio
 *     are absent, this list will be empty.
 */
const getSupportedTypes = (): string[] => {
  // No supported types if no Web Audio API
  if (!AudioContextFactory.getAudioContext()) {
    return [];
  }

  // We support 8-bit and 16-bit raw PCM
  return [
    'audio/L8',
    'audio/L16'
  ];
}

export {
  AudioBufferSource,
  getSupportedTypes,
  isSupportedType

}
export default RawAudioPlayer
