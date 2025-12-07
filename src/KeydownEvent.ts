import KeyEvent from "./KeyEvent";
import {quirks} from "./Constant";
import {isPrintable, key_identifier_sane, keysym_from_key_identifier, keysym_from_keycode} from "./utils";

class KeydownEvent extends KeyEvent {
  private readonly _keyupReliable: boolean;

  constructor(orig: KeyboardEvent) {
    super(orig);
    this.keysym = keysym_from_key_identifier(this.key, this.location) || keysym_from_keycode(this.keyCode, this.location);
    this._keyupReliable = !quirks.keyupUnreliable;

    // DOM3 and keyCode are reliable sources if the corresponding key is
    // not a printable key
    if (this.keysym && !isPrintable(this.keysym)) {
      this.reliable = true;
    }

    // Use legacy keyIdentifier as a last resort, if it looks sane
    if (!this.keysym && key_identifier_sane(this.keyCode, this.keyIdentifier)) {
      this.keysym = keysym_from_key_identifier(this.keyIdentifier, this.location, this.modifiers.shift);
    }
    // If a key is pressed while meta is held down, the keyup will
    // never be sent in Chrome (bug #108404)
    if (this.modifiers.meta && this.keysym !== 0xFFE7 && this.keysym !== 0xFFE8) {
      this._keyupReliable = false;
    }
    // We cannot rely on receiving keyup for Caps Lock on certain platforms
    else if (this.keysym === 0xFFE5 && quirks.capsLockKeyupUnreliable) {
      this._keyupReliable = false;
    }

    // Determine whether default action for Alt+combinations must be prevented
    let prevent_alt = !this.modifiers.ctrl && !quirks.altIsTypableOnly;

    // Determine whether default action for Ctrl+combinations must be prevented
    let prevent_ctrl = !this.modifiers.alt;

    // We must rely on the (potentially buggy) keyIdentifier if preventing
    // the default action is important
    if ((prevent_ctrl && this.modifiers.ctrl)
      || (prevent_alt && this.modifiers.alt)
      || this.modifiers.meta
      || this.modifiers.hyper) {
      this.reliable = true;
    }

    // Record most recently known keysym by associated key code
    this.recentKeysym[this.keyCode as number] = this.keysym as number;
  }


  get keyupReliable(): boolean {
    return this._keyupReliable;
  }
}

export default KeydownEvent