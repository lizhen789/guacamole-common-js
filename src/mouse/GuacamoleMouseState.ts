import Position from "../Position";

class GuacamoleMouseState extends Position {
  private _left: boolean;
  private _middle: boolean;
  private _right: boolean;
  private _up: boolean;
  private _down: boolean;


  constructor(template?: GuacamoleMouseState) {
    template = template || {} as GuacamoleMouseState;
    super(template);

    /**
     * Whether the left mouse button is currently pressed.
     *
     * @type {!boolean}
     * @default false
     */
    this._left = template._left || false;

    /**
     * Whether the middle mouse button is currently pressed.
     *
     * @type {!boolean}
     * @default false
     */
    this._middle = template._middle || false;

    /**
     * Whether the right mouse button is currently pressed.
     *
     * @type {!boolean}
     * @default false
     */
    this._right = template._right || false;

    /**
     * Whether the up mouse button is currently pressed. This is the fourth
     * mouse button, associated with upward scrolling of the mouse scroll
     * wheel.
     *
     * @type {!boolean}
     * @default false
     */
    this._up = template._up || false;

    /**
     * Whether the down mouse button is currently pressed. This is the fifth
     * mouse button, associated with downward scrolling of the mouse scroll
     * wheel.
     *
     * @type {!boolean}
     * @default false
     */
    this._down = template._down || false;
  }

  get left(): boolean {
    return this._left;
  }

  get middle(): boolean {
    return this._middle;
  }

  get right(): boolean {
    return this._right;
  }

  get up(): boolean {
    return this._up;
  }

  get down(): boolean {
    return this._down;
  }

  set left(value: boolean) {
    this._left = value;
  }

  set middle(value: boolean) {
    this._middle = value;
  }

  set right(value: boolean) {
    this._right = value;
  }

  set up(value: boolean) {
    this._up = value;
  }

  set down(value: boolean) {
    this._down = value;
  }
}

export default GuacamoleMouseState