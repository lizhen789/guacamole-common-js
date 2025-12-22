import MouseEventTarget from "./MouseEventTarget";
import Buttons from "./Buttons";
import {GuacamoleDOMEvent} from "../Event";
import Position from "../Position";

/**
 * Whether the browser supports CSS3 cursor styling, including hotspot
 * coordinates.
 *
 * @private
 * @type {!boolean}
 */
const CSS3_CURSOR_SUPPORTED = (() => {

  let div = document.createElement("div");

  // If no cursor property at all, then no support
  if (!("cursor" in div.style))
    return false;

  try {
    // Apply simple 1x1 PNG
    div.style.cursor = "url(data:image/png;base64,"
      + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
      + "AQMAAAAl21bKAAAAA1BMVEX///+nxBvI"
      + "AAAACklEQVQI12NgAAAAAgAB4iG8MwAA"
      + "AABJRU5ErkJggg==) 0 0, auto";
  } catch (e) {
    return false;
  }

  // Verify cursor property is set to URL with hotspot
  return /\burl\([^()]*\)\s+0\s+0\b/.test(div.style.cursor || "");

})();

class Mouse extends MouseEventTarget {
  private readonly element: HTMLElement;
  private readonly touchMouseThreshold: number;
  private readonly scrollThreshold: number;
  private readonly PIXELS_PER_LINE: number;
  private readonly PIXELS_PER_PAGE: number;


  /**
   * Array of {@link GuacamoleMouseState} button names corresponding to the
   * mouse button indices used by DOM mouse events.
   *
   * @private
   * @type {!string[]}
   */
  private MOUSE_BUTTONS: Buttons[] = [
    Buttons.LEFT,
    Buttons.MIDDLE,
    Buttons.RIGHT
  ];

  /**
   * Counter of mouse events to ignore. This decremented by mousemove, and
   * while non-zero, mouse events will have no effect.
   *
   * @private
   * @type {!number}
   */
  private ignore_mouse: number = 0;

  /**
   * Cumulative scroll delta amount. This value is accumulated through scroll
   * events and results in scroll button clicks if it exceeds a certain
   * threshold.
   *
   * @private
   * @type {!number}
   */
  private scroll_delta: number = 0;


  constructor(element: HTMLElement) {
    super();
    this.element = element;


    /**
     * The number of mousemove events to require before re-enabling mouse
     * event handling after receiving a touch event.
     *
     * @type {!number}
     */
    this.touchMouseThreshold = 3;

    /**
     * The minimum amount of pixels scrolled required for a single scroll button
     * click.
     *
     * @type {!number}
     */
    this.scrollThreshold = 53;

    /**
     * The number of pixels to scroll per line.
     *
     * @type {!number}
     */
    this.PIXELS_PER_LINE = 18;

    /**
     * The number of pixels to scroll per page.
     *
     * @type {!number}
     */
    this.PIXELS_PER_PAGE = this.PIXELS_PER_LINE * 16;

    // Block context menu so right-click gets sent properly
    element.addEventListener("contextmenu", this._contextmenu.bind(this), false);
    element.addEventListener("mousemove", this._mousemove.bind(this), false);
    element.addEventListener("mousedown", this._mousedown.bind(this), false);
    element.addEventListener("mouseup", this._mouseup.bind(this), false);
    element.addEventListener("mouseout", this._mouseout.bind(this), false);
    element.addEventListener("selectstart", this._selectstart.bind(this), false);
    element.addEventListener("touchmove", this._ignorePendingMouseEvents.bind(this), { passive: true });
    element.addEventListener("touchstart", this._ignorePendingMouseEvents.bind(this), { passive: true });
    element.addEventListener("touchend", this._ignorePendingMouseEvents.bind(this), { passive: true });
    element.addEventListener('wheel', this._mousewheel_handler.bind(this), { passive: true });
  }

  private _contextmenu(e: PointerEvent) {
    GuacamoleDOMEvent.cancelEvent(e as unknown as GuacamoleDOMEvent);
  }

  private _mousemove(e: MouseEvent) {
    // If ignoring events, decrement counter
    if (this.ignore_mouse) {
      GuacamoleDOMEvent.cancelEvent(e as unknown as GuacamoleDOMEvent);
      this.ignore_mouse--;
      return;
    }
    this.move(Position.fromClientPosition(this.element, e.clientX, e.clientY), e as unknown as GuacamoleDOMEvent);
  }

  private _mousedown(e: MouseEvent) {
    // Do not handle if ignoring events
    if (this.ignore_mouse) {
      GuacamoleDOMEvent.cancelEvent(e as unknown as GuacamoleDOMEvent);
      return;
    }

    let button = this.MOUSE_BUTTONS[e.button];
    if (button) {
      this.press(button, e as unknown as GuacamoleDOMEvent);
    }
  }

  private _mouseup(e: MouseEvent) {
    // Do not handle if ignoring events
    if (this.ignore_mouse) {
      GuacamoleDOMEvent.cancelEvent(e as unknown as GuacamoleDOMEvent);
      return;
    }

    let button = this.MOUSE_BUTTONS[e.button];
    if (button) {
      this.release(button, e as unknown as GuacamoleDOMEvent);
    }
  }

  private _mouseout(e: MouseEvent) {

    // Get parent of the element the mouse pointer is leaving
    if (!e) {
      e = window.event as MouseEvent;
    }

    // Check that mouseout is due to actually LEAVING the element
    let target = e?.relatedTarget || (e as any)?.toElement;
    while (target) {
      if (target === this.element)
        return;
      target = target.parentNode;
    }

    // Release all buttons and fire mouseout
    this.reset(e as unknown as GuacamoleDOMEvent);
    this.out(e as unknown as GuacamoleDOMEvent);
  }

  private _selectstart(e: Event) {
    GuacamoleDOMEvent.cancelEvent(e as unknown as GuacamoleDOMEvent);
  }

  private _ignorePendingMouseEvents() {
    this.ignore_mouse = this.touchMouseThreshold;
  }

  private _mousewheel_handler(e: WheelEvent) {


    // Determine approximate scroll amount (in pixels)
    let delta = e.deltaY;

    // If successfully retrieved scroll amount, convert to pixels if not
    // already in pixels
    if (delta) {

      // Convert to pixels if delta was lines
      if (e.deltaMode === 1)
        delta = e.deltaY * this.PIXELS_PER_LINE;

      // Convert to pixels if delta was pages
      else if (e.deltaMode === 2)
        delta = e.deltaY * this.PIXELS_PER_PAGE;

    }

    // Otherwise, assume legacy mousewheel event and line scrolling
    else
      delta = e.detail * this.PIXELS_PER_LINE;

    // Update overall delta
    this.scroll_delta += delta;

    // Up
    if (this.scroll_delta <= -this.scrollThreshold) {

      // Repeatedly click the up button until insufficient delta remains
      do {
        this.click(Buttons.UP, e as unknown as GuacamoleDOMEvent);
        this.scroll_delta += this.scrollThreshold;
      } while (this.scroll_delta <= -this.scrollThreshold);

      // Reset delta
      this.scroll_delta = 0;

    }

    // Down
    if (this.scroll_delta >= this.scrollThreshold) {

      // Repeatedly click the down button until insufficient delta remains
      do {
        this.click(Buttons.DOWN, e as unknown as GuacamoleDOMEvent);
        this.scroll_delta -= this.scrollThreshold;
      } while (this.scroll_delta >= this.scrollThreshold);

      // Reset delta
      this.scroll_delta = 0;

    }

    // All scroll/wheel events must currently be cancelled regardless of
    // whether the dispatched event is cancelled, as there is no Guacamole
    // scroll event and thus no way to cancel scroll events that are
    // smaller than required to produce an up/down click
    GuacamoleDOMEvent.cancelEvent(e as unknown as GuacamoleDOMEvent);
  }

  /**
   * Changes the local mouse cursor to the given canvas, having the given
   * hotspot coordinates. This affects styling of the element backing this
   * Guacamole.Mouse only, and may fail depending on browser support for
   * setting the mouse cursor.
   *
   * If setting the local cursor is desired, it is up to the implementation
   * to do something else, such as use the software cursor built into
   * Guacamole.Display, if the local cursor cannot be set.
   *
   * @param {!HTMLCanvasElement} canvas
   *     The cursor image.
   *
   * @param {!number} x
   *     The X-coordinate of the cursor hotspot.
   *
   * @param {!number} y
   *     The Y-coordinate of the cursor hotspot.
   *
   * @return {!boolean}
   *     true if the cursor was successfully set, false if the cursor could
   *     not be set for any reason.
   */
  setCursor(canvas: HTMLCanvasElement, x: number, y: number): boolean {
    // Attempt to set via CSS3 cursor styling
    if (CSS3_CURSOR_SUPPORTED) {
      let dataURL = canvas.toDataURL('image/png');
      this.element.style.cursor = "url(" + dataURL + ") " + x + " " + y + ", auto";
      return true;
    }

    // Otherwise, setting cursor failed
    return false;
  }
}

export default Mouse