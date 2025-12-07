import ModifierState from "./ModifierState";

class KeyEvent extends KeyboardEvent {
  private _orig: KeyboardEvent;
  private _keyCode: number;
  private _keyIdentifier: string;
  private _key: string;
  private _location: number;
  private _modifiers: ModifierState;
  private readonly _timestamp: number;
  private _defaultPrevented: boolean;
  private _keysym: number | null = null;
  private _reliable: boolean;

  private _pressed: Record<number, boolean> = {};
  private _recentKeysym: Record<number, number> = {};

  constructor(orig: KeyboardEvent) {
    super(orig.type);
    this._orig = orig;
    this._keyCode = orig ? (orig.which || orig.keyCode) : 0;
    this._keyIdentifier = orig && orig?.key;
    this._key = orig && orig.key;
    this._location = orig ? this.getEventLocation(orig) : 0;
    this._modifiers = orig ? ModifierState.fromKeyboardEvent(orig) : new ModifierState();
    this._timestamp = new Date().getTime();
    this._defaultPrevented = false;
    this._keysym = null;
    this._reliable = false;
  }

  getAge() {
    return new Date().getTime() - this._timestamp;
  }

  private getEventLocation(e: KeyboardEvent) {
    // Use standard location, if possible
    if ('location' in e) {
      return e.location;
    }


    // Failing that, attempt to use deprecated keyLocation
    if ('keyLocation' in e) {
      return e['keyLocation'];
    }


    // If no location is available, assume left side
    return 0;
  }

  get orig(): KeyboardEvent {
    return this._orig;
  }

  get keyCode(): number {
    return this._keyCode;
  }

  get keyIdentifier(): string {
    return this._keyIdentifier;
  }

  get key(): string {
    return this._key;
  }

  get location(): number {
    return this._location;
  }

  get modifiers(): ModifierState {
    return this._modifiers;
  }

  get timestamp(): number {
    return this._timestamp;
  }

  get defaultPrevented(): boolean {
    return this._defaultPrevented;
  }

  get keysym(): number | null {
    return this._keysym;
  }


  set keysym(value: number | null) {
    this._keysym = value;
  }

  get reliable(): boolean {
    return this._reliable;
  }

  set reliable(value: boolean) {
    this._reliable = value;
  }

  set orig(value: KeyboardEvent) {
    this._orig = value;
  }

  set keyCode(value: number) {
    this._keyCode = value;
  }

  set keyIdentifier(value: string) {
    this._keyIdentifier = value;
  }

  set key(value: string) {
    this._key = value;
  }

  set location(value: number) {
    this._location = value;
  }

  set modifiers(value: ModifierState) {
    this._modifiers = value;
  }

  set defaultPrevented(value: boolean) {
    this._defaultPrevented = value;
  }

  get pressed(): Record<number, boolean> {
    return this._pressed;
  }

  set pressed(value: Record<number, boolean>) {
    this._pressed = value;
  }

  get recentKeysym(): Record<number, number> {
    return this._recentKeysym;
  }

  set recentKeysym(value: Record<number, number>) {
    this._recentKeysym = value;
  }
}

export default KeyEvent