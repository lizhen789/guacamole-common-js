import MouseEventTarget from "./MouseEventTarget";
import GuacamoleMouseState from "./GuacamoleMouseState";
import Buttons from "./Buttons";
import GuacamoleEvent from "../Event";
import Position from "../Position";

class Touchpad extends MouseEventTarget {
  private element: HTMLElement;
  private scrollThreshold: number;
  private clickTimingThreshold: number;
  private clickMoveThreshold: number;
  private touch_buttons: Record<number, Buttons> = {
    1: Buttons.LEFT,
    2: Buttons.RIGHT,
    3: Buttons.MIDDLE
  };

  private touch_count: number = 0;
  private last_touch_x: number = 0;
  private last_touch_y: number = 0;
  private last_touch_time: number = 0;
  private pixels_moved: number = 0;


  private gesture_in_progress: boolean = false;
  private click_release_timeout: number | null = null;

  constructor(element: HTMLElement) {
    super();
    this.element = element;

    /**
     * The distance a two-finger touch must move per scrollwheel event, in
     * pixels.
     *
     * @type {!number}
     */
    this.scrollThreshold = 20 * (window.devicePixelRatio || 1);

    /**
     * The maximum number of milliseconds to wait for a touch to end for the
     * gesture to be considered a click.
     *
     * @type {!number}
     */
    this.clickTimingThreshold = 250;

    /**
     * The maximum number of pixels to allow a touch to move for the gesture to
     * be considered a click.
     *
     * @type {!number}
     */
    this.clickMoveThreshold = 10 * (window.devicePixelRatio || 1);

    /**
     * The current mouse state. The properties of this state are updated when
     * mouse events fire. This state object is also passed in as a parameter to
     * the handler of any mouse events.
     *
     * @type {!GuacamoleMouseState}
     */
    this.currentState = new GuacamoleMouseState();

    element.addEventListener("touchend", this._touchend, false);

    element.addEventListener("touchstart", this._touchstart, false);

    element.addEventListener("touchmove", this._touchmove, false);
  }

  private _touchend(e: TouchEvent) {


    e.preventDefault();

    // If we're handling a gesture AND this is the last touch
    if (this.gesture_in_progress && e.touches.length === 0) {

      let time = new Date().getTime();

      // Get corresponding mouse button
      let button: Buttons = this.touch_buttons[this.touch_count];

      // If mouse already down, release anad clear timeout
      if (this.currentState[button]) {

        // Fire button up event
        this.release(button, e as unknown as GuacamoleEvent);

        // Clear timeout, if set
        if (this.click_release_timeout) {
          clearTimeout(this.click_release_timeout);
          this.click_release_timeout = null;
        }

      }

      // If single tap detected (based on time and distance)
      if (time - this.last_touch_time <= this.clickTimingThreshold && this.pixels_moved < this.clickMoveThreshold) {

        // Fire button down event
        this.press(button, e as unknown as GuacamoleEvent);

        // Delay mouse up - mouse up should be canceled if
        // touchstart within timeout.
        this.click_release_timeout = setTimeout(() => {

          // Fire button up event
          this.release(button, e as unknown as GuacamoleEvent);

          // Gesture now over
          this.gesture_in_progress = false;

        }, this.clickTimingThreshold);
      }

      // If we're not waiting to see if this is a click, stop gesture
      if (!this.click_release_timeout) {
        this.gesture_in_progress = false;
      }
    }
  }

  private _touchstart(e: TouchEvent) {
    e.preventDefault();

    // Track number of touches, but no more than three
    this.touch_count = Math.min(e.touches.length, 3);

    // Clear timeout, if set
    if (this.click_release_timeout) {
      clearTimeout(this.click_release_timeout);
      this.click_release_timeout = null;
    }

    // Record initial touch location and time for touch movement
    // and tap gestures
    if (!this.gesture_in_progress) {

      // Stop mouse events while touching
      this.gesture_in_progress = true;

      // Record touch location and time
      let starting_touch = e.touches[0];
      this.last_touch_x = starting_touch.clientX;
      this.last_touch_y = starting_touch.clientY;
      this.last_touch_time = new Date().getTime();
      this.pixels_moved = 0;
    }
  }

  private _touchmove(e: TouchEvent) {
    e.preventDefault();

    // Get change in touch location
    let touch = e.touches[0];
    let delta_x = touch.clientX - this.last_touch_x;
    let delta_y = touch.clientY - this.last_touch_y;

    // Track pixels moved
    this.pixels_moved += Math.abs(delta_x) + Math.abs(delta_y);

    // If only one touch involved, this is mouse move
    if (this.touch_count === 1) {

      // Calculate average velocity in Manhatten pixels per millisecond
      let velocity = this.pixels_moved / (new Date().getTime() - this.last_touch_time);

      // Scale mouse movement relative to velocity
      let scale = 1 + velocity;

      // Update mouse location
      let position = new Position(this.currentState);
      position.x += delta_x * scale;
      position.y += delta_y * scale;

      // Prevent mouse from leaving screen
      position.x = Math.min(Math.max(0, position.x), this.element.offsetWidth - 1);
      position.y = Math.min(Math.max(0, position.y), this.element.offsetHeight - 1);

      // Fire movement event, if defined
      this.move(position, e as unknown as GuacamoleEvent);

      // Update touch location
      this.last_touch_x = touch.clientX;
      this.last_touch_y = touch.clientY;

    }

    // Interpret two-finger swipe as scrollwheel
    else if (this.touch_count === 2) {

      // If change in location passes threshold for scroll
      if (Math.abs(delta_y) >= this.scrollThreshold) {

        // Decide button based on Y movement direction
        let button: Buttons;
        if (delta_y > 0) {
          button = Buttons.DOWN;
        } else {
          button = Buttons.UP;
        }

        this.click(button, e as unknown as GuacamoleEvent);

        // Only update touch location after a scroll has been
        // detected
        this.last_touch_x = touch.clientX;
        this.last_touch_y = touch.clientY;
      }
    }
  }
}

export default Touchpad