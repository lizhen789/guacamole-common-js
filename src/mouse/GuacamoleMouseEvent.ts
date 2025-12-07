import GuacamoleMouseState from "./GuacamoleMouseState";
import {GuacamoleDOMEvent, GuacamoleEvent} from "../Event";

class GuacamoleMouseEvent extends GuacamoleDOMEvent {
  private readonly legacyHandlerName: string;
  private _state: GuacamoleMouseState;

  constructor(type: string, state: GuacamoleMouseState, events: GuacamoleEvent | GuacamoleEvent[]) {
    super(type, events);
    this.legacyHandlerName = 'on' + this.type;
    this._state = state;
  }


  invokeLegacyHandler(target: any) {
    if (target[this.legacyHandlerName]) {
      this.preventDefault();
      this.stopPropagation();
      target[this.legacyHandlerName](this._state);
    }
  }


  get state(): GuacamoleMouseState {
    return this._state;
  }

  set state(value: GuacamoleMouseState) {
    this._state = value;
  }
}

export default GuacamoleMouseEvent