import Tunnel from "./tunnel";
import Client, {InstructionHandlerKey, StateType} from "./Client";

class Instruction {
  private readonly _opcode: InstructionHandlerKey;
  private readonly _args: string[];

  constructor(opcode: InstructionHandlerKey, args: string[]) {
    this._opcode = opcode;
    this._args = args;
  }

  getSize() {
    // Init with length of opcode
    let size = this._opcode.length;

    // Add length of all arguments
    for (let i = 0; i < this._args.length; i++) {
      size += this._args[i].length;
    }
    return size;
  }


  get opcode(): InstructionHandlerKey {
    return this._opcode;
  }

  get args(): string[] {
    return this._args;
  }
}


class Frame {
  private _keyframe: boolean = false;
  private readonly _timestamp: number = 0;
  private readonly _instructions: Instruction[] = [];
  private _clientState: StateType | null = null;


  constructor(timestamp: number, instructions: Instruction[]) {
    this._timestamp = timestamp;
    this._instructions = instructions;
  }

  get keyframe(): boolean {
    return this._keyframe;
  }

  get timestamp(): number {
    return this._timestamp;
  }

  get instructions(): Instruction[] {
    return this._instructions;
  }

  get clientState(): StateType | null {
    return this._clientState;
  }

  set keyframe(value: boolean) {
    this._keyframe = value;
  }

  set clientState(value: StateType) {
    this._clientState = value;
  }
}

class SessionRecording {
  public static readonly KEYFRAME_CHAR_INTERVAL = 16384;
  public static readonly KEYFRAME_TIME_INTERVAL = 5000;
  public static readonly MAXIMUM_SEEK_TIME = 5;
  private frames: Frame[] = [];
  private instructions: Instruction[] = [];
  private charactersSinceLastKeyframe: number = 0;
  private lastKeyframeTimestamp: number = 0;
  private currentFrame: number = -1;
  private readonly playbackTunnel: PlaybackTunnel;
  private playbackClient: Client;
  private tunnel: Tunnel;

  private startVideoTimestamp: number | null = null;
  private startRealTimestamp: number | null = null;
  private seekTimeout: number | null = null;
  onProgress?: (duration: number) => void;
  onSeek?: (position: number) => void;
  onPause?: () => void;
  onPlay?: () => void;

  constructor(tunnel: Tunnel) {
    this.tunnel = tunnel;
    this.playbackTunnel = new PlaybackTunnel();
    this.playbackClient = new Client(this.playbackTunnel);
    this.playbackClient.connect();
    this.playbackClient.getDisplay().showCursor(false);
    this.playbackTunnel.onInstruction = this.onInstruction;
  }

  private onInstruction(opcode: InstructionHandlerKey, args: string[]) {
    // Store opcode and arguments for received instruction
    let instruction = new Instruction(opcode, args.slice());
    this.instructions.push(instruction);
    this.charactersSinceLastKeyframe += instruction.getSize();

    // Once a sync is received, store all instructions since the last
    // frame as a new frame
    if (opcode === 'sync') {

      // Parse frame timestamp from sync instruction
      let timestamp = parseInt(args[0]);

      // Add a new frame containing the instructions read since last frame
      let frame = new Frame(timestamp, this.instructions);
      this.frames.push(frame);

      // This frame should eventually become a keyframe if enough data
      // has been processed and enough recording time has elapsed, or if
      // this is the absolute first frame
      if (this.frames.length === 1 || (this.charactersSinceLastKeyframe >= SessionRecording.KEYFRAME_CHAR_INTERVAL && timestamp - this.lastKeyframeTimestamp >= SessionRecording.KEYFRAME_TIME_INTERVAL)) {
        frame.keyframe = true;
        this.lastKeyframeTimestamp = timestamp;
        this.charactersSinceLastKeyframe = 0;
      }

      // Clear set of instructions in preparation for next frame
      this.instructions = [];

      // Notify that additional content is available
      if (this.onProgress) {
        this.onProgress(this.getDuration());
      }
    }
  }

  getDuration() {

    // If no frames yet exist, duration is zero
    if (this.frames.length === 0) {
      return 0;
    }

    // Recording duration is simply the timestamp of the last frame
    return this.toRelativeTimestamp(this.frames[frames.length - 1].timestamp);
  }

  private toRelativeTimestamp(timestamp: number) {
    // If no frames yet exist, all timestamps are zero
    if (this.frames.length === 0)
      return 0;

    // Calculate timestamp relative to first frame
    return timestamp - this.frames[0].timestamp;
  }

  private findFrame(minIndex: number, maxIndex: number, timestamp: number): number {
    // Do not search if the region contains only one element
    if (minIndex === maxIndex)
      return minIndex;

    // Split search region into two halves
    let midIndex = Math.floor((minIndex + maxIndex) / 2);
    let midTimestamp = this.toRelativeTimestamp(this.frames[midIndex].timestamp);

    // If timestamp is within lesser half, search again within that half
    if (timestamp < midTimestamp && midIndex > minIndex) {
      return this.findFrame(minIndex, midIndex - 1, timestamp);
    }


    // If timestamp is within greater half, search again within that half
    if (timestamp > midTimestamp && midIndex < maxIndex) {
      return this.findFrame(midIndex + 1, maxIndex, timestamp);
    }

    // Otherwise, we lucked out and found a frame with exactly the
    // desired timestamp
    return midIndex;
  }

  private replayFrame(index: number) {
    let frame = this.frames[index];

    // Replay all instructions within the retrieved frame
    for (let i = 0; i < frame.instructions.length; i++) {
      let instruction = frame.instructions[i];
      this.playbackTunnel.receiveInstruction(instruction.opcode, instruction.args);
    }

    // Store client state if frame is flagged as a keyframe
    if (frame.keyframe && !frame.clientState) {
      this.playbackClient.exportState(function storeClientState(state) {
        frame.clientState = state;
      });
    }
  }

  private abortSeek() {
    if (this.seekTimeout) {
      clearTimeout(this.seekTimeout);
    }
  }

  private seekToFrame(index: number, callback: () => void, delay: number = 0) {


    // Abort any in-progress seek
    this.abortSeek();

    // Replay frames asynchronously
    this.seekTimeout = setTimeout(() => {

      let startIndex;

      // Back up until startIndex represents current state
      for (startIndex = index; startIndex >= 0; startIndex--) {

        let frame = this.frames[startIndex];

        // If we've reached the current frame, startIndex represents
        // current state by definition
        if (startIndex === this.currentFrame) {
          break;
        }

        // If frame has associated absolute state, make that frame the
        // current state
        if (frame.clientState) {
          this.playbackClient.importState(frame.clientState);
          break;
        }

      }

      // Advance to frame index after current state
      startIndex++;

      let startTime = new Date().getTime();

      // Replay any applicable incremental frames
      for (; startIndex <= index; startIndex++) {

        // Stop seeking if the operation is taking too long
        let currentTime = new Date().getTime();
        if (currentTime - startTime >= SessionRecording.MAXIMUM_SEEK_TIME) {
          break;
        }


        this.replayFrame(startIndex);
      }

      // Current frame is now at requested index
      this.currentFrame = startIndex - 1;

      // Notify of changes in position
      if (this.onSeek) {
        this.onSeek(this.getPosition());
      }

      // If the seek operation has not yet completed, schedule continuation
      if (this.currentFrame !== index) {
        this.seekToFrame(index, callback, Math.max(delay - (new Date().getTime() - startTime), 0));
      }


      // Notify that the requested seek has completed
      else {
        callback();
      }

    }, delay || 0);
  }

  getPosition() {
    // Position is simply zero if playback has not started at all
    if (this.currentFrame === -1) {
      return 0;
    }

    // Return current position as a millisecond timestamp relative to the
    // start of the recording
    return this.toRelativeTimestamp(this.frames[this.currentFrame].timestamp);
  }

  private continuePlayback() {
    // If frames remain after advancing, schedule next frame
    if (this.currentFrame + 1 < this.frames.length) {

      // Pull the upcoming frame
      let next = this.frames[this.currentFrame + 1];

      // Calculate the real timestamp corresponding to when the next
      // frame begins
      let nextRealTimestamp = next.timestamp - (this.startVideoTimestamp ?? 0) + (this.startRealTimestamp ?? 0);

      // Calculate the relative delay between the current time and
      // the next frame start
      let delay = Math.max(nextRealTimestamp - new Date().getTime(), 0);

      // Advance to next frame after enough time has elapsed
      this.seekToFrame(this.currentFrame + 1, () => {
        this.continuePlayback();
      }, delay);

    }

    // Otherwise stop playback
    else {
      this.pause();
    }

  }

  pause() {

    // Abort any in-progress seek / playback
    this.abortSeek();

    // Stop playback only if playback is in progress
    if (this.isPlaying()) {

      // Notify that playback is stopping
      if (this.onPause) {
        this.onPause();
      }


      // Playback is stopped
      this.startVideoTimestamp = null;
      this.startRealTimestamp = null;

    }
  }

  play() {
    // If playback is not already in progress and frames remain,
    // begin playback
    if (!this.isPlaying() && this.currentFrame + 1 < this.frames.length) {

      // Notify that playback is starting
      if (this.onPlay) {
        this.onPlay();
      }


      // Store timestamp of playback start for relative scheduling of
      // future frames
      let next = this.frames[this.currentFrame + 1];
      this.startVideoTimestamp = next.timestamp;
      this.startRealTimestamp = new Date().getTime();

      // Begin playback of video
      this.continuePlayback();
    }
  }

  isPlaying() {
    return !!this.startVideoTimestamp;
  }

  connect(data: string) {
    this.tunnel.connect(data);
  }

  disconnect() {
    this.tunnel.disconnect();
  }

  getDisplay() {
    return this.playbackClient.getDisplay();
  }

  seek(position: number, callback: () => void) {

    // Do not seek if no frames exist
    if (this.frames.length === 0) {
      return;
    }


    // Pause playback, preserving playback state
    let originallyPlaying = this.isPlaying();
    this.pause();

    // Perform seek
    this.seekToFrame(this.findFrame(0, frames.length - 1, position), () => {

      // Restore playback state
      if (originallyPlaying) {
        this.play();
      }

      // Notify that seek has completed
      if (callback) {
        callback();
      }
    });
  }
}


class PlaybackTunnel extends Tunnel {
  receiveInstruction(opcode: InstructionHandlerKey, args: string[]) {
    if (this.onInstruction) {
      this.onInstruction(opcode, args);
    }
  }
}

export {
  SessionRecording,
  Frame,
  Instruction,
  PlaybackTunnel
}
export default SessionRecording;