import {noRepeat, quirks} from "../Constant";
import KeyEvent from "./KeyEvent";
import ModifierState, {type ModifierStateType} from "../ModifierState";
import {keysym_from_charcode} from "../utils";
import KeydownEvent from "./KeydownEvent";
import KeypressEvent from "./KeypressEvent";
import KeyupEvent from "./KeyupEvent";

class Keyboard {
  private element: HTMLElement;

  public static _nextID: number = 0;
  private guacKeyboardID = Keyboard._nextID++;
  private EVENT_MARKER: string = "_this_HANDLED_BY_" + this.guacKeyboardID;

  private eventLog: KeyEvent[] = []

  private modifiers: ModifierState;
  private pressed: Record<number, boolean> = {};
  private implicitlyPressed: Record<number, boolean> = {};
  private last_keydown_result: Record<number, boolean> = {};
  private recentKeysym: Record<number, number> = {};

  private key_repeat_timeout: number | null = null;
  private key_repeat_interval: number | null = null;

  onKeyDown?: (key: number) => boolean;
  onKeyUp?: (key: number) => void;

  constructor(element: HTMLElement) {
    this.element = element;
    if (navigator && navigator.platform) {

      // All keyup events are unreliable on iOS (sadly)
      if (navigator.platform.match(/ipad|iphone|ipod/i)) {
        quirks.keyupUnreliable = true;
      }
        // The Alt key on Mac is never used for keyboard shortcuts, and the
      // Caps Lock key never dispatches keyup events
      else if (navigator.platform.match(/^mac/i)) {
        quirks.altIsTypableOnly = true;
        quirks.capsLockKeyupUnreliable = true;
      }
    }
    this.modifiers = new ModifierState();
    // Listen to given element, if any
    if (element) {
      this.listenTo(element);
    }
  }

  press(keysym: number) {


    // Don't bother with pressing the key if the key is unknown
    if (keysym === null) return;

    // Only press if released
    if (!this.pressed[keysym]) {

      // Mark key as pressed
      this.pressed[keysym] = true;

      // Send key event
      if (this.onKeyDown) {
        let result = this.onKeyDown(keysym);
        this.last_keydown_result[keysym] = result;

        // Stop any current repeat
        this.key_repeat_timeout && clearTimeout(this.key_repeat_timeout);
        this.key_repeat_interval && clearInterval(this.key_repeat_interval);

        // Repeat after a delay as long as pressed
        if (!noRepeat[keysym])
          this.key_repeat_timeout = setTimeout(() => {
            this.key_repeat_interval = setInterval(() => {
              if (this.onKeyUp) {
                this.onKeyUp(keysym);
              }
              if (this.onKeyDown) {
                this.onKeyDown(keysym);
              }
            }, 50);
          }, 500);

        return result;
      }
    }

    // Return the last keydown result by default, resort to false if unknown
    return this.last_keydown_result[keysym] || false;
  }

  release(keysym: number) {
    // Only release if pressed
    if (this.pressed[keysym]) {

      // Mark key as released
      delete this.pressed[keysym];
      delete this.implicitlyPressed[keysym];

      // Stop repeat
      this.key_repeat_timeout && clearTimeout(this.key_repeat_timeout);
      this.key_repeat_interval && clearInterval(this.key_repeat_interval);

      // Send key event
      if (keysym !== null && this.onKeyUp)
        this.onKeyUp(keysym);

    }
  }

  type(str: string) {
    // Press/release the key corresponding to each character in the string
    for (let i = 0; i < str.length; i++) {

      // Determine keysym of current character
      let codepoint = str.codePointAt ? str.codePointAt(i) : str.charCodeAt(i);
      if (!codepoint) {
        continue;
      }
      let keysym = keysym_from_charcode(codepoint);

      // Press and release key for current character
      if (keysym) {
        this.press(keysym);
        this.release(keysym);
      }
    }
  }

  reset() {
    // Release all pressed keys
    for (let keysym in this.pressed) {
      this.release(parseInt(keysym));
    }
    // Clear event log
    this.eventLog = [];
  }

  private updateModifierState(modifier: ModifierStateType, keysyms: number[], keyEvent: KeyEvent) {


    let localState = keyEvent.modifiers[modifier];
    let remoteState = this.modifiers[modifier];

    let i;

    // Do not trust changes in modifier state for events directly involving
    // that modifier: (1) the flag may erroneously be cleared despite
    // another version of the same key still being held and (2) the change
    // in flag may be due to the current event being processed, thus
    // updating things here is at best redundant and at worst incorrect
    if (keyEvent.keysym && keysyms.indexOf(keyEvent.keysym) !== -1) {
      return;
    }


    // Release all related keys if modifier is implicitly released
    if (remoteState && !localState) {
      for (i = 0; i < keysyms.length; i++) {
        this.release(keysyms[i]);
      }
    }

    // Press if modifier is implicitly pressed
    else if (!remoteState && localState) {

      // Verify that modifier flag isn't already pressed or already set
      // due to another version of the same key being held down
      for (i = 0; i < keysyms.length; i++) {
        if (this.pressed[keysyms[i]])
          return;
      }

      // Mark as implicitly pressed only if there is other information
      // within the key event relating to a different key. Some
      // platforms, such as iOS, will send essentially empty key events
      // for modifier keys, using only the modifier flags to signal the
      // identity of the key.
      let keysym = keysyms[0];
      if (keyEvent.keysym) {
        this.implicitlyPressed[keysym] = true;
      }
      this.press(keysym);
    }
  }

  private syncModifierStates(keyEvent: KeyEvent) {

    // Resync state of alt
    this.updateModifierState('alt', [
      0xFFE9, // Left alt
      0xFFEA, // Right alt
      0xFE03  // AltGr
    ], keyEvent);

    // Resync state of shift
    this.updateModifierState('shift', [
      0xFFE1, // Left shift
      0xFFE2  // Right shift
    ], keyEvent);

    // Resync state of ctrl
    this.updateModifierState('ctrl', [
      0xFFE3, // Left ctrl
      0xFFE4  // Right ctrl
    ], keyEvent);

    // Resync state of meta
    this.updateModifierState('meta', [
      0xFFE7, // Left meta
      0xFFE8  // Right meta
    ], keyEvent);

    // Resync state of hyper
    this.updateModifierState('hyper', [
      0xFFEB, // Left super/hyper
      0xFFEC  // Right super/hyper
    ], keyEvent);

    // Update state
    this.modifiers = keyEvent.modifiers;
  }

  private release_simulated_altgr(keysym: number) {


    // Both Ctrl+Alt must be pressed if simulated AltGr is in use
    if (!this.modifiers.ctrl || !this.modifiers.alt)
      return;

    // Assume [A-Z] never require AltGr
    if (keysym >= 0x0041 && keysym <= 0x005A)
      return;

    // Assume [a-z] never require AltGr
    if (keysym >= 0x0061 && keysym <= 0x007A)
      return;

    // Release Ctrl+Alt if the keysym is printable
    if (keysym <= 0xFF || (keysym & 0xFF000000) === 0x01000000) {
      this.release(0xFFE3); // Left ctrl 
      this.release(0xFFE4); // Right ctrl 
      this.release(0xFFE9); // Left alt
      this.release(0xFFEA); // Right alt
    }
  }

  private isStateImplicit() {
    for (let keysym in this.pressed) {
      if (!this.implicitlyPressed[keysym])
        return false;
    }

    return true;
  }

  private interpret_event() {

    // Peek at first event in log
    let first = this.eventLog[0];
    if (!first) {
      return null;
    }


    // Keydown event
    if (first instanceof KeydownEvent) {

      let keysym = null;
      let accepted_events: KeyEvent[] = [];

      // Defer handling of Meta until it is known to be functioning as a
      // modifier (it may otherwise actually be an alternative method for
      // pressing a single key, such as Meta+Left for Home on ChromeOS)
      if (first.keysym === 0xFFE7 || first.keysym === 0xFFE8) {

        // Defer handling until further events exist to provide context
        if (this.eventLog.length === 1) {
          return null;
        }


        // Drop keydown if it turns out Meta does not actually apply
        if (this.eventLog[1].keysym !== first.keysym) {
          if (!this.eventLog[1].modifiers.meta) {
            return this.eventLog.shift();
          }
        }

          // Drop duplicate keydown events while waiting to determine
          // whether to acknowledge Meta (browser may repeat keydown
        // while the key is held)
        else if (this.eventLog[1] instanceof KeydownEvent) {
          return this.eventLog.shift();
        }
      }

      // If event itself is reliable, no need to wait for other events
      if (first.reliable) {
        keysym = first.keysym;
        accepted_events = this.eventLog.splice(0, 1);
      }

      // If keydown is immediately followed by a keypress, use the indicated character
      else if (this.eventLog[1] instanceof KeypressEvent) {
        keysym = this.eventLog[1].keysym;
        accepted_events = this.eventLog.splice(0, 2);
      }

        // If keydown is immediately followed by anything else, then no
        // keypress can possibly occur to clarify this event, and we must
      // handle it now
      else if (this.eventLog[1]) {
        keysym = first.keysym;
        accepted_events = this.eventLog.splice(0, 1);
      }

      // Fire a key press if valid events were found
      if (accepted_events.length > 0) {

        this.syncModifierStates(first);

        if (keysym) {

          // Fire event
          this.release_simulated_altgr(keysym);
          let defaultPrevented = !this.press(keysym);
          this.recentKeysym[first.keyCode] = keysym;

          // Release the key now if we cannot rely on the associated
          // keyup event
          if (!first.keyupReliable) {
            this.release(keysym);
          }


          // Record whether default was prevented
          for (let i = 0; i < accepted_events.length; i++) {
            accepted_events[i].defaultPrevented = defaultPrevented;
          }
        }

        return first;
      }
    } // end if keydown

    // Keyup event
    else if (first instanceof KeyupEvent && !quirks.keyupUnreliable) {

      // Release specific key if known
      let keysym = first.keysym;
      if (keysym) {
        this.release(keysym);
        delete this.recentKeysym[first.keyCode];
        first.defaultPrevented = true;
      }

      // Otherwise, fall back to releasing all keys
      else {
        this.reset();
        return first;
      }

      this.syncModifierStates(first);
      return this.eventLog.shift();

    } // end if keyup

      // Ignore any other type of event (keypress by itself is invalid, and
    // unreliable keyup events should simply be dumped)
    else {
      return this.eventLog.shift();
    }
    // No event interpreted
    return null;
  }

  /**
   * Reads through the event log, removing events from the head of the log
   * when the corresponding true key presses are known (or as known as they
   * can be).
   *
   * @private
   * @return {boolean}
   *     Whether the default action of the latest event should be prevented.
   */
  private interpret_events() {

    // Do not prevent default if no event could be interpreted
    let handled_event = this.interpret_event();
    if (!handled_event) {
      return false;
    }


    // Interpret as much as possible
    let last_event;
    do {
      last_event = handled_event;
      handled_event = this.interpret_event();
    } while (handled_event !== null);

    // Reset keyboard state if we cannot expect to receive any further
    // keyup events
    if (this.isStateImplicit()) {
      this.reset();
    }
    return last_event?.defaultPrevented;
  }

  private markEvent(e: any) {
    // Fail if event is already marked
    if (e[this.EVENT_MARKER]) {
      return false;
    }


    // Mark event otherwise
    e[this.EVENT_MARKER] = true;
    return true;
  }

  private _keydown(e: KeyboardEvent) {


    // Only intercept if handler set
    if (!this.onKeyDown) return;

    // Ignore events which have already been handled
    if (!this.markEvent(e)) return;

    let keydownEvent = new KeydownEvent(e);

    // Ignore (but do not prevent) the "composition" keycode sent by some
    // browsers when an IME is in use (see: http://lists.w3.org/Archives/Public/www-dom/2010JulSep/att-0182/keyCode-spec.html)
    if (keydownEvent.keyCode === 229)
      return;

    // Log event
    this.eventLog.push(keydownEvent);

    // Interpret as many events as possible, prevent default if indicated
    if (this.interpret_events())
      e.preventDefault();
  }

  private _keypress(e: KeyboardEvent) {


    // Only intercept if handler set
    if (!this.onKeyDown && !this.onKeyUp) return;

    // Ignore events which have already been handled
    if (!this.markEvent(e)) return;

    // Log event
    this.eventLog.push(new KeypressEvent(e));

    // Interpret as many events as possible, prevent default if indicated
    if (this.interpret_events()) {
      e.preventDefault();
    }
  }

  private _keyup(e: KeyboardEvent) {
    // Only intercept if handler set
    if (!this.onKeyUp) return;

    // Ignore events which have already been handled
    if (!this.markEvent(e)) return;

    e.preventDefault();

    // Log event, call for interpretation
    this.eventLog.push(new KeyupEvent(e));
    this.interpret_events();
  }

  listenTo(element: HTMLElement) {
    // When key pressed
    element.addEventListener("keydown", this._keydown, true);

    // When key pressed
    element.addEventListener("keypress", this._keypress, true);

    // When key released
    element.addEventListener("keyup", this._keyup, true);


    // Automatically type text entered into the wrapped field
    element.addEventListener("input", this._handleInput, false);
    element.addEventListener("compositionend", this._handleComposition, false);
  }

  private _handleInput(e: Event) {
    // Only intercept if handler set
    if (!this.onKeyDown && !this.onKeyUp) return;

    // Ignore events which have already been handled
    if (!this.markEvent(e)) return;
    const {data, isComposing} = e as InputEvent;
    // Type all content written
    if (data && !isComposing) {
      this.element.removeEventListener("compositionend", this._handleComposition, false);
      this.type(data);
    }
  }

  private _handleComposition(e: Event) {

    // Only intercept if handler set
    if (!this.onKeyDown && !this.onKeyUp) return;

    // Ignore events which have already been handled
    if (!this.markEvent(e)) return;
    const {data} = e as InputEvent;
    // Type all content written
    if (data) {
      this.element.removeEventListener("input", this._handleInput, false);
      this.type(data);
    }
  }
}

export default Keyboard