import {InstructionHandlerKey} from "../Client";
import Status from "../Status";

enum TunnelState {
  CLOSED = 0,
  CONNECTING = 1,
  OPEN = 2,
  UNSTABLE = 3
}

/**
 * Core object providing abstract communication for Guacamole. This object
 * is a null implementation whose functions do nothing. Guacamole applications
 * should use {@link HTTPTunnel} instead, or implement their own tunnel based
 * on this one.
 */
class Tunnel {
  public static readonly INTERNAL_DATA_OPCODE = '';
  /**
   * The current state of the tunnel connection.
   */
  private _state: TunnelState;

  /**
   * The UUID associated with the tunnel connection.
   */
  private _uuid: string;

  private _receiveTimeout: number = 15000;
  private _unstableThreshold: number = 1500;

  /**
   * Called whenever this tunnel's state changes.
   */
  onStateChange?: (state: TunnelState) => void;

  /**
   * Called whenever a UUID is set for this tunnel.
   */
  onUUID?: (uuid: string) => void;
  /**
   * Fired whenever an error is encountered by the tunnel.
   *
   * @event
   * @param {!Status} status
   *     A status object which describes the error.
   */
  onError?: (status: Status) => void;
  onInstruction?: (opcode: InstructionHandlerKey, parameters: string[]) => void;

  /**
   * @constructor
   */
  constructor() {
    this._state = TunnelState.CONNECTING;
    this._uuid = '';
  }

  /**
   * Connect to the tunnel with the given optional data. This data is
   * typically used for authentication. The format of data accepted is
   * up to the tunnel implementation.
   *
   * @param [_data] The data to send to the tunnel when connecting.
   */
  connect(_data?: string): void {
    // 基础实现为空
  }

  /**
   * Disconnect from the tunnel.
   */
  disconnect(): void {
    // 基础实现为空
  }

  /**
   * Send the given message through the tunnel to the service on the other
   * side. All messages are guaranteed to be received in the order sent.
   *
   * @param _elements The elements of the message to send to the service on the other side
   *                 of the tunnel.
   */
  sendMessage(..._elements: any[]): void {
    // 基础实现为空
  }

  /**
   * Changes the stored numeric state of this tunnel, firing the onstatechange
   * event if the new state is different and a handler has been defined.
   *
   * @private
   * @param state The new state of this tunnel.
   */
  setState(state: TunnelState): void {
    // Notify only if state changes
    if (state !== this._state) {
      this._state = state;
      if (this.onStateChange) {
        this.onStateChange(state);
      }
    }
  }

  /**
   * Changes the stored UUID that uniquely identifies this tunnel, firing the
   * onuuid event if a handler has been defined.
   *
   * @private
   * @param uuid The new UUID of this tunnel.
   */
  setUUID(uuid: string): void {
    this._uuid = uuid;
    if (this.onUUID) {
      this.onUUID(uuid);
    }
  }

  /**
   * Returns whether this tunnel is currently connected.
   *
   * @returns true if this tunnel is currently connected, false otherwise.
   */
  isConnected(): boolean {
    return this._state === TunnelState.OPEN || this._state === TunnelState.UNSTABLE;
  }


  get state(): number {
    return this._state;
  }

  set state(value: number) {
    this._state = value;
  }

  get uuid(): string {
    return this._uuid;
  }

  set uuid(value: string) {
    this._uuid = value;
  }

  get receiveTimeout(): number {
    return this._receiveTimeout;
  }

  set receiveTimeout(value: number) {
    this._receiveTimeout = value;
  }

  get unstableThreshold(): number {
    return this._unstableThreshold;
  }

  set unstableThreshold(value: number) {
    this._unstableThreshold = value;
  }
}

export {
  TunnelState,
  Tunnel
}
// 导出类供其他模块使用
export default Tunnel;