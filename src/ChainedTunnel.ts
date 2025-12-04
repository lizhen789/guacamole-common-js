import Tunnel, {TunnelState} from "./Tunnel";
import Status, {StatusCode} from "./Status";

class ChainedTunnel extends Tunnel {
  private connect_data?: string;
  private tunnels: Tunnel[] = [];
  private committedTunnel: Tunnel | null = null;


  constructor(...tunnelChain: Tunnel[]) {
    super();
    this.tunnels.push(...tunnelChain)
  }

  private attach(tunnel: Tunnel) {


    // Set own functions to tunnel's functions
    this.disconnect = tunnel.disconnect;
    this.sendMessage = tunnel.sendMessage;

    /**
     * Fails the currently-attached tunnel, attaching a new tunnel if
     * possible.
     *
     * @private
     * @param {Status} [status]
     *     An object representing the failure that occured in the
     *     currently-attached tunnel, if known.
     *
     * @return {Tunnel}
     *     The next tunnel, or null if there are no more tunnels to try or
     *     if no more tunnels should be tried.
     */
    let failTunnel = (status?: Status) => {

      // Do not attempt to continue using next tunnel on server timeout
      if (status && status.code === StatusCode.UPSTREAM_TIMEOUT) {
        this.tunnels = [];
        return null;
      }

      // Get next tunnel
      let next_tunnel = this.tunnels.shift();

      // If there IS a next tunnel, try using it.
      if (next_tunnel) {
        tunnel.onError = void 0;
        tunnel.onInstruction = void 0;
        tunnel.onStateChange = void 0;
        this.attach(next_tunnel);
      }

      return next_tunnel;
    };

    /**
     * Use the current tunnel from this point forward. Do not try any more
     * tunnels, even if the current tunnel fails.
     *
     * @private
     */
    const commit_tunnel = () => {

      tunnel.onStateChange = this.onStateChange;
      tunnel.onInstruction = this.onInstruction;
      tunnel.onError = this.onError;
      tunnel.onUUID = this.onUUID;

      // Assign UUID if already known
      if (tunnel.uuid) {
        this.setUUID(tunnel.uuid);
      }


      this.committedTunnel = tunnel;

    }

    // Wrap own onstatechange within current tunnel
    tunnel.onStateChange = (state) => {

      switch (state) {

        // If open, use this tunnel from this point forward.
        case TunnelState.OPEN:
          commit_tunnel();
          if (this.onStateChange) {
            this.onStateChange(state);
          }

          break;

        // If closed, mark failure, attempt next tunnel
        case TunnelState.CLOSED:
          if (!failTunnel() && this.onStateChange)
            this.onStateChange(state);
          break;

      }

    };

    // Wrap own oninstruction within current tunnel
    tunnel.onInstruction = (opcode, elements) => {

      // Accept current tunnel
      commit_tunnel();

      // Invoke handler
      if (this.onInstruction) {
        this.onInstruction(opcode, elements);
      }


    };

    // Attach next tunnel on error
    tunnel.onError = (status) => {

      // Mark failure, attempt next tunnel
      if (!failTunnel(status) && this.onError)
        this.onError(status);

    };

    // Attempt connection
    tunnel.connect(this.connect_data);
  }

  connect(data?: string) {
    // Remember connect data
    this.connect_data = data;

    // Get committed tunnel if exists or the first tunnel on the list
    let next_tunnel = this.committedTunnel ? this.committedTunnel : this.tunnels.shift();

    // Attach first tunnel
    if (next_tunnel) {
      this.attach(next_tunnel);
    }


    // If there IS no first tunnel, error
    else if (this.onError) {
      this.onError(new Status(StatusCode.SERVER_ERROR, "No tunnels to try."));
    }

  }
}

export default ChainedTunnel