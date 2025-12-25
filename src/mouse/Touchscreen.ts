import MouseEventTarget from "./MouseEventTarget";
import Buttons from "./Buttons";
import {GuacamoleEvent} from "../Event";
import Position from "../Position";

class Touchscreen extends MouseEventTarget {
  private readonly _element: HTMLElement;

  /**
   * Whether a gesture is known to be in progress. If false, touch events
   * will be ignored.
   *
   * @private
   * @type {!boolean}
   */
  private _gesture_in_progress: boolean = false;

  /**
   * The start X location of a gesture.
   *
   * @private
   * @type {number}
   */
  private _gesture_start_x: number | null = null;

  /**
   * The start Y location of a gesture.
   *
   * @private
   * @type {number}
   */
  private _gesture_start_y: number | null = null;

  /**
   * The timeout associated with the delayed, cancellable click release.
   *
   * @private
   * @type {number}
   */
  private _click_release_timeout: number | null = null;

  /**
   * The timeout associated with long-press for right click.
   *
   * @private
   * @type {number}
   */
  private _long_press_timeout: number | null = null;
  private _scrollThreshold: number;
  private _clickTimingThreshold: number;
  private _clickMoveThreshold: number;
  private _longPressThreshold: number;

  constructor(element: HTMLElement) {
    super();
    this._element = element;


    /**
     * The distance a two-finger touch must move per scrollwheel event, in
     * pixels.
     *
     * @type {!number}
     */
    this._scrollThreshold = 20 * (window.devicePixelRatio || 1);

    /**
     * The maximum number of milliseconds to wait for a touch to end for the
     * gesture to be considered a click.
     *
     * @type {!number}
     */
    this._clickTimingThreshold = 250;

    /**
     * The maximum number of pixels to allow a touch to move for the gesture to
     * be considered a click.
     *
     * @type {!number}
     */
    this._clickMoveThreshold = 16 * (window.devicePixelRatio || 1);

    /**
     * The amount of time a press must be held for long press to be
     * detected.
     */
    this._longPressThreshold = 500;
    element.addEventListener("touchend", this._touchend.bind(this), false);

    element.addEventListener("touchstart", this._touchstart.bind(this), false);

    element.addEventListener("touchmove", this._touchmove.bind(this), false);
  }

  private finger_moved(e: TouchEvent) {
    let touch = e.touches[0] || e.changedTouches[0];
    let delta_x = touch.clientX - (this._gesture_start_x || 0);
    let delta_y = touch.clientY - (this._gesture_start_y || 0);
    return Math.sqrt(delta_x * delta_x + delta_y * delta_y) >= this._clickMoveThreshold;
  }

  /**
   * Begins a new gesture at the location of the first touch in the given
   * touch event.
   *
   * @private
   * @param {!TouchEvent} e
   *     The touch event beginning this new gesture.
   */
  private begin_gesture(e: TouchEvent) {
    let touch = e.touches[0];
    this._gesture_in_progress = true;
    this._gesture_start_x = touch.clientX;
    this._gesture_start_y = touch.clientY;
  }

  private end_gesture() {
    this._click_release_timeout && clearTimeout(this._click_release_timeout);
    this._long_press_timeout && clearTimeout(this._long_press_timeout);
    this._gesture_in_progress = false;
  }

  private _touchend(e: TouchEvent) {

    // Do not handle if no gesture
    if (!this._gesture_in_progress) {
      return;
    }


    // Ignore if more than one touch
    if (e.touches.length !== 0 || e.changedTouches.length !== 1) {
      this.end_gesture();
      return;
    }

    // Long-press, if any, is over
    this._long_press_timeout && clearTimeout(this._long_press_timeout);

    // Always release mouse button if pressed
    this.release(Buttons.LEFT, e as unknown as GuacamoleEvent);

    // If finger hasn't moved enough to cancel the click
    if (!this.finger_moved(e)) {

      e.preventDefault();

      // If not yet pressed, press and start delay release
      if (!this.currentState.left) {

        let touch = e.changedTouches[0];
        this.move(Position.fromClientPosition(this._element, touch.clientX, touch.clientY), e as unknown as GuacamoleEvent);
        this.press(Buttons.LEFT, e as unknown as GuacamoleEvent);

        // Release button after a delay, if not canceled
        this._click_release_timeout = setTimeout(() => {
          this.release(Buttons.LEFT, e as unknown as GuacamoleEvent);
          this.end_gesture();
        }, this._clickTimingThreshold);

      }

    } // end if finger not moved
  }

  private _touchstart(e: TouchEvent) {

    // Ignore if more than one touch
    if (e.touches.length !== 1) {
      this.end_gesture();
      return;
    }

    e.preventDefault();

    // New touch begins a new gesture
    this.begin_gesture(e);

    // Keep button pressed if tap after left click
    this._click_release_timeout && clearTimeout(this._click_release_timeout);

    // Click right button if this turns into a long-press
    this._long_press_timeout = setTimeout(() => {
      let touch = e.touches[0];
      this.move(Position.fromClientPosition(this._element, touch.clientX, touch.clientY), e as unknown as GuacamoleEvent);
      this.click(Buttons.RIGHT, e as unknown as GuacamoleEvent);
      this.end_gesture();
    }, this._longPressThreshold);
  }

  private _touchmove(e: TouchEvent) {

    // Do not handle if no gesture
    if (!this._gesture_in_progress)
      return;

    // Cancel long press if finger moved
    if (this.finger_moved(e))
      this._long_press_timeout && clearTimeout(this._long_press_timeout);

    // Ignore if more than one touch
    if (e.touches.length !== 1) {
      this.end_gesture();
      return;
    }

    // Update mouse position if dragging
    if (this.currentState.left) {

      e.preventDefault();

      // Update state
      let touch = e.touches[0];
      this.move(Position.fromClientPosition(this._element, touch.clientX, touch.clientY), e as unknown as GuacamoleEvent);
    }
  }

  get element(): HTMLElement {
    return this._element;
  }

  get gesture_in_progress(): boolean {
    return this._gesture_in_progress;
  }

  get gesture_start_x(): number | null {
    return this._gesture_start_x;
  }

  get gesture_start_y(): number | null {
    return this._gesture_start_y;
  }

  get click_release_timeout(): number | null {
    return this._click_release_timeout;
  }

  get long_press_timeout(): number | null {
    return this._long_press_timeout;
  }

  get scrollThreshold(): number {
    return this._scrollThreshold;
  }

  get clickTimingThreshold(): number {
    return this._clickTimingThreshold;
  }

  get clickMoveThreshold(): number {
    return this._clickMoveThreshold;
  }

  get longPressThreshold(): number {
    return this._longPressThreshold;
  }
}

export default Touchscreen