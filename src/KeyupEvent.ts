import KeyEvent from "./KeyEvent";
import {keysym_from_key_identifier, keysym_from_keycode} from "./utils";

class KeyupEvent extends KeyEvent {

  constructor(orig: KeyboardEvent) {
    super(orig);
    // If key is known from keyCode or DOM3 alone, use that (keyCode is
    // still more reliable for keyup when dead keys are in use)
    this.keysym = keysym_from_keycode(this.keyCode, this.location) || keysym_from_key_identifier(this.key, this.location);

    // Fall back to the most recently pressed keysym associated with the
    // keyCode if the inferred key doesn't seem to actually be pressed
    if (!this.pressed[this.keysym as number]) {
      this.keysym = this.recentKeysym[this.keyCode] || this.keysym;
    }
    // Keyup is as reliable as it will ever be
    this.reliable = true;
  }
}

export default KeyupEvent