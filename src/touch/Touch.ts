import {GuacamoleEventTarget} from "../Event";
import TouchState from "./TouchState";
import GuacamoleTouchEvent from "./GuacamoleTouchEvent";

class Touch extends GuacamoleEventTarget {
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

export default Touch