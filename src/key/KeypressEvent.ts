import KeyEvent from "./KeyEvent";
import {keysym_from_charcode} from "../utils";

class KeypressEvent extends KeyEvent {

  constructor(orig: KeyboardEvent) {
    super(orig);
    // Pull keysym from char code
    this.keysym = keysym_from_charcode(this.keyCode);

    // Keypress is always reliable
    this.reliable = true;
  }

}

export default KeypressEvent