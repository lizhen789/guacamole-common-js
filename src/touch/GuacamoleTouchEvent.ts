import {GuacamoleDOMEvent} from "../Event";
import TouchState from "./TouchState";

class GuacamoleTouchEvent extends GuacamoleDOMEvent {

  private readonly _state: TouchState;

  constructor(type: string, event: TouchEvent, state: TouchState) {
    super(type, [event]);
    this._state = state;
  }

  get state(): TouchState {
    return this._state;
  }
}
export default GuacamoleTouchEvent