import {DOMEvent, EventTarget} from "./Event";
import Position from "./Position";

class TouchState extends Position {
  private readonly _id: number;
  private _radiusX: number;
  private _radiusY: number;
  private _angle: number;
  private _force: number;

  constructor(template?: Partial<TouchState>) {
    template = template || {} as TouchState;
    super(template);
    this._id = template.id || 0;
    this._radiusX = template.radiusX || 0;
    this._radiusY = template.radiusY || 0;
    this._angle = template.angle || 0;
    this._force = template.force || 0;
  }


  get id(): number {
    return this._id;
  }

  get radiusX(): number {
    return this._radiusX;
  }

  get radiusY(): number {
    return this._radiusY;
  }

  get angle(): number {
    return this._angle;
  }

  get force(): number {
    return this._force;
  }


  set radiusX(value: number) {
    this._radiusX = value;
  }

  set radiusY(value: number) {
    this._radiusY = value;
  }

  set angle(value: number) {
    this._angle = value;
  }

  set force(value: number) {
    this._force = value;
  }
}

class GuacamoleTouchEvent extends DOMEvent {

  private readonly _state: TouchState;

  constructor(type: string, event: TouchEvent, state: TouchState) {
    super(type, [event]);
    this._state = state;
  }

  get state(): TouchState {
    return this._state;
  }
}

class Touch extends EventTarget {
  public static readonly DEFAULT_CONTACT_RADIUS = Math.floor(16 * window.devicePixelRatio);
  private touches: Record<number, TouchState> = {};
  private activeTouches: number = 0;
  private readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    super();
    this.element = element;
    element.addEventListener('touchstart', this.touchstart, false);
    element.addEventListener('touchmove', this.touchmove, false);
    element.addEventListener('touchend', this.touchend, false);
  }

  private touchstart(e: TouchEvent) {
    // Fire "ontouchstart" events for all new touches
    for (let i = 0; i < e.changedTouches.length; i++) {

      let changedTouch = e.changedTouches[i];
      let identifier = changedTouch.identifier;

      // Ignore duplicated touches
      if (this.touches[identifier]) {
        continue;
      }


      let touch = this.touches[identifier] = new TouchState({
        id: identifier,
        radiusX: changedTouch.radiusX || Touch.DEFAULT_CONTACT_RADIUS,
        radiusY: changedTouch.radiusY || Touch.DEFAULT_CONTACT_RADIUS,
        angle: changedTouch.rotationAngle || 0.0,
        force: changedTouch.force || 1.0 /* Within JavaScript changedTouch events, a force of 0.0 indicates the device does not support reporting changedTouch force */
      });

      this.activeTouches++;

      touch.fromClientPosition(this.element, changedTouch.clientX, changedTouch.clientY);
      this.dispatch(new GuacamoleTouchEvent('touchmove', e, touch));

    }
  }

  private touchmove(e: TouchEvent) {

    // Fire "ontouchmove" events for all updated touches
    for (let i = 0; i < e.changedTouches.length; i++) {

      let changedTouch = e.changedTouches[i];
      let identifier = changedTouch.identifier;

      // Ignore any unrecognized touches
      let touch = this.touches[identifier];
      if (!touch) {
        continue;
      }


      // Update force only if supported by browser (otherwise, assume
      // force is unchanged)
      if (changedTouch.force) {
        touch.force = changedTouch.force;
      }


      // Update touch area, if supported by browser and device
      touch.angle = changedTouch.rotationAngle || 0.0;
      touch.radiusX = changedTouch.radiusX || Touch.DEFAULT_CONTACT_RADIUS;
      touch.radiusY = changedTouch.radiusY || Touch.DEFAULT_CONTACT_RADIUS;

      // Update with any change in position
      touch.fromClientPosition(this.element, changedTouch.clientX, changedTouch.clientY);
      this.dispatch(new GuacamoleTouchEvent('touchmove', e, touch));
    }
  }

  private touchend(e: TouchEvent) {

    // Fire "ontouchend" events for all updated touches
    for (let i = 0; i < e.changedTouches.length; i++) {

      let changedTouch = e.changedTouches[i];
      let identifier = changedTouch.identifier;

      // Ignore any unrecognized touches
      let touch = this.touches[identifier];
      if (!touch) {
        continue;
      }


      // Stop tracking this particular touch
      delete this.touches[identifier];
      this.activeTouches--;

      // Touch has ended
      touch.force = 0.0;

      // Update with final position
      touch.fromClientPosition(this.element, changedTouch.clientX, changedTouch.clientY);
      this.dispatch(new GuacamoleTouchEvent('touchend', e, touch));
    }
  }
}


export {
  Touch,
  TouchState,
  GuacamoleTouchEvent
}

export default Touch;