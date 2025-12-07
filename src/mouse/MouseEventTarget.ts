import {GuacamoleEvent, GuacamoleEventTarget} from "../Event";
import GuacamoleMouseState from "./GuacamoleMouseState"
import GuacamoleMouseEvent from "./GuacamoleMouseEvent";
import Buttons from "./Buttons";
import Position from "../Position";
import {keys} from "es-toolkit/compat";

class MouseEventTarget extends GuacamoleEventTarget {
  private _currentState: GuacamoleMouseState;

  constructor() {
    super();
    this._currentState = new GuacamoleMouseState();
  }

  press(button: Buttons, events: GuacamoleEvent | GuacamoleEvent[]) {
    if (!this._currentState[button]) {
      this._currentState[button] = true;
      this.dispatch(new GuacamoleMouseEvent('mousedown', this._currentState, events));
    }
  }

  release(button: Buttons, events: GuacamoleEvent | GuacamoleEvent[]) {
    if (this._currentState[button]) {
      this._currentState[button] = false;
      this.dispatch(new GuacamoleMouseEvent('mouseup', this._currentState, events));
    }
  }

  click(button: Buttons, events: GuacamoleEvent | GuacamoleEvent[]) {
    this.press(button, events);
    this.release(button, events);
  }

  move(position: Position, events: GuacamoleEvent | GuacamoleEvent[]) {
    if (this._currentState.x !== position.x || this._currentState.y !== position.y) {
      this._currentState.x = position.x;
      this._currentState.y = position.y;
      this.dispatch(new GuacamoleMouseEvent('mousemove', this._currentState, events));
    }
  }

  out(events: GuacamoleEvent | GuacamoleEvent[]) {
    this.dispatch(new GuacamoleMouseEvent('mouseout', this._currentState, events));
  }

  reset(events: GuacamoleEvent | GuacamoleEvent[]) {
    for (let button in keys(Buttons)) {
      this.release(Buttons[button as keyof typeof Buttons], events);
    }
  }

  get currentState(): GuacamoleMouseState {
    return this._currentState;
  }

  set currentState(value: GuacamoleMouseState) {
    this._currentState = value;
  }
}

export default MouseEventTarget