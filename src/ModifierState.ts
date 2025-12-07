class ModifierState {
  private _shift: boolean = false;
  private _ctrl: boolean = false;
  private _alt: boolean = false;
  private _meta: boolean = false;
  private _hyper: boolean = false;

  constructor() {
  }

  public static fromKeyboardEvent(e: KeyboardEvent) {
    let state = new ModifierState();

    // Assign states from old flags
    state.shift = e.shiftKey;
    state.ctrl = e.ctrlKey;
    state.alt = e.altKey;
    state.meta = e.metaKey;

    // Use DOM3 getModifierState() for others
    if (e.getModifierState) {
      state.hyper = e.getModifierState("OS")
        || e.getModifierState("Super")
        || e.getModifierState("Hyper")
        || e.getModifierState("Win");
    }

    return state;
  }

  get shift(): boolean {
    return this._shift;
  }

  set shift(value: boolean) {
    this._shift = value;
  }

  get ctrl(): boolean {
    return this._ctrl;
  }

  set ctrl(value: boolean) {
    this._ctrl = value;
  }

  get alt(): boolean {
    return this._alt;
  }

  set alt(value: boolean) {
    this._alt = value;
  }

  get meta(): boolean {
    return this._meta;
  }

  set meta(value: boolean) {
    this._meta = value;
  }

  get hyper(): boolean {
    return this._hyper;
  }

  set hyper(value: boolean) {
    this._hyper = value;
  }
}

type ModifierStateType=keyof ModifierState;
export {
  ModifierStateType
}

export default ModifierState