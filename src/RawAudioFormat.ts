/**
 * 音频格式模板接口，用于构造RawAudioFormat实例
 */
export interface AudioFormatTemplate {
  /** 每个音频样本的字节数 */
  readonly  bytesPerSample: number;
  /** 音频通道数（例如：单声道为1，立体声为2） */
  readonly  channels: number;
  /** 每秒采样率，每通道 */
  readonly  rate: number;
}

/**
 * A description of the format of raw PCM audio, such as that used by
 * Guacamole.RawAudioPlayer and Guacamole.RawAudioRecorder.
 */
class RawAudioFormat implements AudioFormatTemplate {
  /**
   * The number of bytes in each sample of audio data. This value is
   * independent of the number of channels.
   */
  readonly bytesPerSample: number;

  /**
   * The number of audio channels (ie: 1 for mono, 2 for stereo).
   */
  readonly channels: number;

  /**
   * The number of samples per second, per channel.
   */
  readonly rate: number;

  /**
   * @constructor
   * @param template The object whose properties should be copied into the corresponding
   *                 properties of the new Guacamole.RawAudioFormat.
   */
  constructor(template: AudioFormatTemplate) {
    this.bytesPerSample = template.bytesPerSample;
    this.channels = template.channels;
    this.rate = template.rate;
  }

  /**
   * Parses the given mimetype, returning a new Guacamole.RawAudioFormat
   * which describes the type of raw audio data represented by that mimetype.
   *
   * @param mimetype The audio mimetype to parse.
   * @returns A new Guacamole.RawAudioFormat which describes the type of raw
   *          audio data represented by the given mimetype, or null if the given
   *          mimetype is not supported.
   */
  static parse(mimetype: string): RawAudioFormat | null {
    let bytesPerSample: number | undefined;
    let rate: number | null = null;
    let channels = 1; // Default for both "audio/L8" and "audio/L16" is one channel

    // "audio/L8" has one byte per sample
    if (mimetype.substring(0, 9) === 'audio/L8;') {
      mimetype = mimetype.substring(9);
      bytesPerSample = 1;
    }
    // "audio/L16" has two bytes per sample
    else if (mimetype.substring(0, 10) === 'audio/L16;') {
      mimetype = mimetype.substring(10);
      bytesPerSample = 2;
    }
    // All other types are unsupported
    else {
      return null;
    }

    // Parse all parameters
    const parameters = mimetype.split(',');

    for (let i = 0; i < parameters.length; i++) {
      let parameter = parameters[i];

      // All parameters must have an equals sign separating name from value
      let equals = parameter.indexOf('=');
      if (equals === -1){
        return null;
      }


      // Parse name and value from parameter string
      let name  = parameter.substring(0, equals);
      let value = parameter.substring(equals+1);

      // Handle each supported parameter
      switch (name) {

        // Number of audio channels
        case 'channels':
          channels = parseInt(value);
          break;

        // Sample rate
        case 'rate':
          rate = parseInt(value);
          break;

        // All other parameters are unsupported
        default:
          return null;

      }
    }

    // If rate was not successfully parsed, mimetype is invalid
    if (rate === null) {
      return null;
    }

    // Return new format with parsed values
    return new RawAudioFormat({
      bytesPerSample,
      channels,
      rate
    });
  }

  /**
   * Returns whether this format is equivalent to the given format.
   *
   * @param format The format to compare with this format.
   * @returns true if the given format is equivalent to this format, false otherwise.
   */
  equals(format: RawAudioFormat): boolean {
    return this.bytesPerSample === format.bytesPerSample &&
      this.channels === format.channels &&
      this.rate === format.rate;
  }

  /**
   * Returns the total number of bytes occupied by a single sample, considering
   * all channels.
   *
   * @returns The total number of bytes occupied by a single sample, considering all channels.
   */
  getBytesPerFrame(): number {
    return this.bytesPerSample * this.channels;
  }

  /**
   * Returns the total number of bytes required to store the given number of samples.
   *
   * @param samples The number of samples to calculate the size for.
   * @returns The total number of bytes required to store the given number of samples.
   */
  getBytesForDuration(samples: number): number {
    return samples * this.getBytesPerFrame();
  }
}

// 导出类供其他模块使用
export default RawAudioFormat;