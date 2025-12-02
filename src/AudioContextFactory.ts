/**
 * Maintains a singleton instance of the Web Audio API AudioContext class,
 * instantiating the AudioContext only in response to the first call to
 * getAudioContext(), and only if no existing AudioContext instance has been
 * provided via the singleton property.
 */
namespace AudioContextFactory {
  /**
   * A singleton instance of a Web Audio API AudioContext object, or null if
   * no instance has yet been created.
   */
  export let singleton: AudioContext | null = null;

  /**
   * Returns a singleton instance of a Web Audio API AudioContext object.
   *
   * @returns A singleton instance of a Web Audio API AudioContext object, or null
   *          if the Web Audio API is not supported.
   */
  export function getAudioContext(): AudioContext | null {
    // Fallback to Webkit-specific AudioContext implementation
    const AudioContextConstructor = window.AudioContext;

    // Get new AudioContext instance if Web Audio API is supported
    if (AudioContextConstructor) {
      try {
        // Create new instance if none yet exists
        if (!singleton) {
          singleton = new AudioContextConstructor();
        }

        // Return singleton instance
        return singleton;
      } catch (e) {
        // Do not use Web Audio API if not allowed by browser
        console.warn('Failed to create AudioContext:', e);
      }
    }

    // Web Audio API not supported
    return null;
  }

  /**
   * Resets the singleton AudioContext instance, forcing a new instance to be
   * created on the next call to getAudioContext().
   */
  export function reset(): void {
    if (singleton) {
      // Close the current AudioContext if possible
      if (singleton.close) {
        try {
          singleton.close();
        } catch (e) {
          // Ignore errors during closure
        }
      }
      singleton = null;
    }
  }
}

// 导出命名空间供其他模块使用
export default AudioContextFactory;