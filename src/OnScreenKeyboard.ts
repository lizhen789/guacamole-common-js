import {isArray, isNumber, isObject} from "es-toolkit/compat";
import {isString} from "es-toolkit";


class Key {
  private readonly _name: string;
  private readonly _title: string;
  private _keysym: number | null;
  private _modifier: string;
  private _requires: string[];

  constructor(template: Partial<Key>, name?: string) {
    this._name = name || template.name || '';
    this._title = template.title || this._name;
    this._keysym = template.keysym || ((title) => {

      // Do not derive keysym if title is not exactly one character
      if (!title || title.length !== 1)
        return null;

      // For characters between U+0000 and U+00FF, the keysym is the codepoint
      let charCode = title.charCodeAt(0);
      if (charCode >= 0x0000 && charCode <= 0x00FF)
        return charCode;

      // For characters between U+0100 and U+10FFFF, the keysym is the codepoint or'd with 0x01000000
      if (charCode >= 0x0100 && charCode <= 0x10FFFF)
        return 0x01000000 | charCode;

      // Unable to derive keysym
      return null;

    })(this._title);
    this._modifier = template.modifier || '';
    this._requires = template.requires || [];
  }


  get name(): string {
    return this._name;
  }

  get title(): string {
    return this._title;
  }

  get keysym(): number | null {
    return this._keysym;
  }

  set keysym(value: number | null) {
    this._keysym = value;
  }

  get modifier(): string {
    return this._modifier;
  }

  set modifier(value: string) {
    this._modifier = value;
  }

  get requires(): string[] {
    return this._requires;
  }

  set requires(value: string[]) {
    this._requires = value;
  }
}

type LayoutKeyValue = number | string | Key | Key[];

class Layout {
  private _language: string;
  private _type: string;
  private _keys: Record<string, LayoutKeyValue>;
  private _layout: Layout;
  private _width: number;
  private _keyWidths: Record<string, number>;

  constructor(template: Layout) {
    this._language = template._language;
    this._type = template._type;
    this._keys = template._keys;
    this._layout = template._layout;
    this._width = template._width;
    this._keyWidths = template._keyWidths;
  }

  get language(): string {
    return this._language;
  }

  set language(value: string) {
    this._language = value;
  }

  get type(): string {
    return this._type;
  }

  set type(value: string) {
    this._type = value;
  }

  get keys(): Record<string, LayoutKeyValue> {
    return this._keys;
  }

  set keys(value: Record<string, LayoutKeyValue>) {
    this._keys = value;
  }

  get layout(): Layout {
    return this._layout;
  }

  set layout(value: Layout) {
    this._layout = value;
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
  }

  get keyWidths(): Record<string, number> {
    return this._keyWidths;
  }

  set keyWidths(value: Record<string, number>) {
    this._keyWidths = value;
  }

}

class ScaledElement {
  private readonly width: number;
  private readonly height: number;
  private readonly element: HTMLElement;
  private readonly scaleFont: boolean;

  constructor(element: HTMLElement, width: number, height: number, scaleFont?: boolean) {
    this.element = element;
    this.width = width;
    this.height = height;
    this.scaleFont = scaleFont || false;
  }

  scale(pixels: number) {
    // Scale element width/height
    this.element.style.width = (this.width * pixels) + "px";
    this.element.style.height = (this.height * pixels) + "px";

    // Scale font, if requested
    if (this.scaleFont) {
      this.element.style.lineHeight = (this.height * pixels) + "px";
      this.element.style.fontSize = pixels + "px";
    }
  }
}

class OnScreenKeyboard {
  private readonly modifierKeysyms: Record<string, number | null>;
  private readonly pressed: Record<string, boolean>;
  private readonly scaledElements: ScaledElement[];
  private ignoreMouse: number = 0;
  private touchMouseThreshold: number = 3;
  private readonly keys: Record<string, LayoutKeyValue>;
  private readonly keyboard: HTMLElement;
  private layout: Layout;

  onKeyDown?: (key: number | undefined) => void;
  onKeyUp?: (key: number | undefined) => void;


  constructor(layout: Layout) {
    this.layout = layout;
    this.modifierKeysyms = {};
    this.pressed = {};
    this.scaledElements = [];

    this.keyboard = document.createElement("div");
    this.keyboard.className = "guac-keyboard";

    // Do not allow selection or mouse movement to propagate/register.

    this.keyboard.onmousemove = this.eventHandler
    this.keyboard.onmouseup = this.eventHandler
    this.keyboard.onmousedown = this.eventHandler
    this.keyboard.onselectstart = this.eventHandler
    this.keys = this.getKeys(layout.keys);
    this.appendElements(this.keyboard, layout.layout);
  }

  private eventHandler(e: Event) {
    // If ignoring events, decrement counter
    if (this.ignoreMouse) {
      this.ignoreMouse--;
    }
    e.stopPropagation();
    return false;
  }

  private addClass(element: HTMLElement, classname: string) {
    // If classList supported, use that
    if (element.classList) {
      element.classList.add(classname);
    }
    // Otherwise, simply append the class
    else {
      element.className += " " + classname;
    }
  }

  private removeClass(element: HTMLElement, classname: string) {
    // If classList supported, use that
    if (element.classList) {
      element.classList.remove(classname);
    }
    // Otherwise, simply remove the class
    else {
      element.className = element.className.replace(/([^ ]+)[ ]*/g,
        function removeMatchingClasses(match, testClassname) {

          // If same class, remove
          if (testClassname === classname)
            return "";

          // Otherwise, allow
          return match;

        }
      );
    }
  }

  ignorePendingMouseEvents() {
    this.ignoreMouse = this.touchMouseThreshold;
  }

  private modifiersPressed(names: string[]) {
    // If any required modifiers are not pressed, return false
    for (let i = 0; i < names.length; i++) {

      // Test whether current modifier is pressed
      let name = names[i];
      if (!(name in this.modifierKeysyms))
        return false;

    }

    // Otherwise, all required modifiers are pressed
    return true;
  }

  private getActiveKey(keyName: string) {
    // Get key array for given name
    let keys = this.keys[keyName];
    if (!keys || !isArray(keys)) {
      return null;
    }


    // Find last matching key
    for (let i = keys.length - 1; i >= 0; i--) {

      // Get candidate key
      let candidate: Key = keys[i];

      // If all required modifiers are pressed, use that key
      if (this.modifiersPressed(candidate.requires))
        return candidate;

    }

    // No valid key
    return null;
  }

  private press(keyName: string, keyElement: HTMLElement) {


    // Press key if not yet pressed
    if (!this.pressed[keyName]) {

      this.addClass(keyElement, "guac-keyboard-pressed");

      // Get current key based on modifier state
      let key = this.getActiveKey(keyName);

      // Update modifier state
      if (key && key.modifier) {

        // Construct classname for modifier
        let modifierClass = "guac-keyboard-modifier-" + this.getCSSName(key.modifier);

        // Retrieve originally-pressed keysym, if modifier was already pressed
        let originalKeysym = this.modifierKeysyms[key.modifier];

        // Activate modifier if not pressed
        if (originalKeysym === undefined) {

          this.addClass(this.keyboard, modifierClass);
          this.modifierKeysyms[key.modifier] = key.keysym;

          // Send key event only if keysym is meaningful
          if (key.keysym && this.onKeyDown) {
            this.onKeyDown(key.keysym);
          }
        }

        // Deactivate if not pressed
        else {
          this.removeClass(this.keyboard, modifierClass);
          delete this.modifierKeysyms[key.modifier];

          // Send key event only if original keysym is meaningful
          if (originalKeysym && this.onKeyUp)
            this.onKeyUp(originalKeysym);

        }

      }

      // If not modifier, send key event now
      else if (this.onKeyDown) {
        this.onKeyDown(key?.keysym ?? undefined);
      }
      // Mark key as pressed
      this.pressed[keyName] = true;
    }
  }

  private release(keyName: string, keyElement: HTMLElement) {

    // Release key if currently pressed
    if (this.pressed[keyName]) {

      this.removeClass(keyElement, "guac-keyboard-pressed");

      // Get current key based on modifier state
      let key = this.getActiveKey(keyName);

      // Send key event if not a modifier key
      if ((key && !key.modifier) && this.onKeyUp) {
        this.onKeyUp(key?.keysym ?? undefined);
      }
      // Mark key as released
      this.pressed[keyName] = false;

    }
  }

  getElement() {
    return this.keyboard;
  }

  resize(width: number) {

    // Get pixel size of a unit
    let unit = Math.floor(width * 10 / this.layout.width) / 10;

    // Resize all scaled elements
    for (let i = 0; i < this.scaledElements.length; i++) {
      let scaledElement = this.scaledElements[i];
      scaledElement.scale(unit);
    }
  }

  private asKeyArray(name: string, object: LayoutKeyValue) {

    // If already an array, just coerce into a true Key[] 
    if (isArray(object)) {
      let keys = [];
      for (let i = 0; i < object.length; i++) {
        keys.push(new Key(object[i], name));
      }
      return keys;
    }

    // Derive key object from keysym if that's all we have
    if (typeof object === 'number') {
      return [new Key({
        name: name,
        keysym: object
      })];
    }

    // Derive key object from title if that's all we have
    if (typeof object === 'string') {
      return [new Key({
        name: name,
        title: object
      })];
    }

    // Otherwise, assume it's already a key object, just not an array
    return [new Key(object, name)];

  }

  private getKeys(keys: Record<string, LayoutKeyValue>) {
    let keyArrays: Record<string, LayoutKeyValue> = {};

    // Coerce all keys into individual key arrays
    for (let name in this.layout.keys) {
      keyArrays[name] = this.asKeyArray(name, keys[name]);
    }

    return keyArrays;
  }

  getCSSName(name: string) {
    // Convert name from possibly-CamelCase to hyphenated lowercase
    return name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .toLowerCase();
  }

  private appendElements(element: HTMLElement, object: Array<any> | Object | string | number, name?: string) {


    let i;

    // Create div which will become the group or key
    let div = document.createElement('div');

    // Add class based on name, if name given
    if (name)
      this.addClass(div, 'guac-keyboard-' + this.getCSSName(name));

    // If an array, append each element
    if (isArray(object)) {

      // Add group class
      this.addClass(div, 'guac-keyboard-group');

      // Append all elements of array
      for (i = 0; i < object.length; i++)
        this.appendElements(div, object[i]);
    }

    // If an object, append each property value
    else if (isObject(object)) {

      // Add group class
      this.addClass(div, 'guac-keyboard-group');

      // Append all children, sorted by name
      let names = Object.keys(object).sort();
      for (i = 0; i < names.length; i++) {
        let name = names[i];
        this.appendElements(div, (object as any)[name], name);
      }
    }

    // If a number, create as a gap 
    else if (isNumber(object)) {

      // Add gap class
      this.addClass(div, 'guac-keyboard-gap');

      // Maintain scale
      this.scaledElements.push(new ScaledElement(div, object, object));

    }

    // If a string, create as a key
    else if (isString(object)) {

      // If key name is only one character, use codepoint for name
      let keyName = object;
      if (keyName.length === 1)
        keyName = '0x' + keyName.charCodeAt(0).toString(16);

      // Add key container class
      this.addClass(div, 'guac-keyboard-key-container');

      // Create key element which will contain all possible caps
      let keyElement = document.createElement('div');
      keyElement.className = 'guac-keyboard-key ' + 'guac-keyboard-key-' + this.getCSSName(keyName);

      // Add all associated keys as caps within DOM
      let keys = this.keys[object];
      if (keys && isArray(keys)) {
        for (i = 0; i < keys.length; i++) {

          // Get current key
          let key = keys[i];

          // Create cap element for key
          let capElement = document.createElement('div');
          capElement.className = 'guac-keyboard-cap';
          capElement.textContent = key.title;

          // Add classes for any requirements
          for (let j = 0; j < key.requires.length; j++) {
            let requirement = key.requires[j];
            this.addClass(capElement, 'guac-keyboard-requires-' + this.getCSSName(requirement));
            this.addClass(keyElement, 'guac-keyboard-uses-' + this.getCSSName(requirement));
          }

          // Add cap to key within DOM
          keyElement.appendChild(capElement);

        }
      }

      // Add key to DOM, maintain scale
      div.appendChild(keyElement);
      this.scaledElements.push(new ScaledElement(div, this.layout.keyWidths[object] || 1, 1, true));

      /**
       * Handles a touch event which results in the pressing of an OSK
       * key. Touch events will result in mouse events being ignored for
       * touchMouseThreshold events.
       *
       * @private
       * @param {!TouchEvent} e
       *     The touch event being handled.
       */
      let touchPress = (e: Event) => {
        e.preventDefault();
        this.ignoreMouse = this.touchMouseThreshold;
        this.press(object, keyElement);
      };

      /**
       * Handles a touch event which results in the release of an OSK
       * key. Touch events will result in mouse events being ignored for
       * touchMouseThreshold events.
       *
       * @private
       * @param {!TouchEvent} e
       *     The touch event being handled.
       */
      let touchRelease = (e: Event) => {
        e.preventDefault();
        this.ignoreMouse = this.touchMouseThreshold;
        this.release(object, keyElement);
      };

      /**
       * Handles a mouse event which results in the pressing of an OSK
       * key. If mouse events are currently being ignored, this handler
       * does nothing.
       *
       * @private
       * @param {!MouseEvent} e
       *     The touch event being handled.
       */
      let mousePress = (e: Event) => {
        e.preventDefault();
        if (this.ignoreMouse === 0)
          this.press(object, keyElement);
      };

      /**
       * Handles a mouse event which results in the release of an OSK
       * key. If mouse events are currently being ignored, this handler
       * does nothing.
       *
       * @private
       * @param {!MouseEvent} e
       *     The touch event being handled.
       */
      let mouseRelease = (e: Event) => {
        e.preventDefault();
        if (this.ignoreMouse === 0)
          this.release(object, keyElement);
      };

      // Handle touch events on key
      keyElement.addEventListener("touchstart", touchPress.bind(this), true);
      keyElement.addEventListener("touchend", touchRelease.bind(this), true);

      // Handle mouse events on key
      keyElement.addEventListener("mousedown", mousePress.bind(this), true);
      keyElement.addEventListener("mouseup", mouseRelease.bind(this), true);
      keyElement.addEventListener("mouseout", mouseRelease.bind(this), true);

    } // end if object is key name

    // Add newly-created group/key
    element.appendChild(div);
  }
}


export {
  OnScreenKeyboard,
  Layout,
  Key,
  LayoutKeyValue,
  ScaledElement
}
export default OnScreenKeyboard;