import {
  keycodeKeysyms,
  type KeycodeKeysymsType,
  keyidentifierKeysym,
  type KeyidentifierKeysymKeyType
} from "./Constant";

const get_keysym = (keysyms: number[] | null, location: number) => {
  if (!keysyms) {
    return null;
  }
  return keysyms[location] || keysyms[0];
}
const isControlCharacter = (codepoint: number) => {
  return codepoint <= 0x1F || (codepoint >= 0x7F && codepoint <= 0x9F);
}
const keysym_from_charcode = (codepoint: number) => {

  // Keysyms for control characters
  if (isControlCharacter(codepoint)) {
    return 0xFF00 | codepoint;
  }

  // Keysyms for ASCII chars
  if (codepoint >= 0x0000 && codepoint <= 0x00FF) {
    return codepoint;
  }


  // Keysyms for Unicode
  if (codepoint >= 0x0100 && codepoint <= 0x10FFFF) {
    return 0x01000000 | codepoint;
  }
  return null;
}

const keysym_from_key_identifier = (identifier: string | undefined, location: number, shifted: boolean = false) => {

  if (!identifier) {
    return null;
  }


  let typedCharacter;

  // If identifier is U+xxxx, decode Unicode character
  let unicodePrefixLocation = identifier.indexOf("U+");
  if (unicodePrefixLocation >= 0) {
    let hex = identifier.substring(unicodePrefixLocation + 2);
    typedCharacter = String.fromCharCode(parseInt(hex, 16));
  }

  // If single character and not keypad, use that as typed character
  else if (identifier.length === 1 && location !== 3) {
    typedCharacter = identifier;
  }


  // Otherwise, look up corresponding keysym
  else {
    return get_keysym(keyidentifierKeysym[identifier as KeyidentifierKeysymKeyType], location);
  }


  // Alter case if necessary
  if (shifted) {
    typedCharacter = typedCharacter.toUpperCase();
  } else if (!shifted) {
    typedCharacter = typedCharacter.toLowerCase();
  }


  // Get codepoint
  let codepoint = typedCharacter.charCodeAt(0);
  return keysym_from_charcode(codepoint);

}
const isPrintable = (keysym: number) => {
  // Keysyms with Unicode equivalents are printable
  return (keysym >= 0x00 && keysym <= 0xFF) || (keysym & 0xFFFF0000) === 0x01000000;
}

const keysym_from_keycode = (keyCode: number, location: number) => {
  return get_keysym(keycodeKeysyms[keyCode as KeycodeKeysymsType], location);
}


const key_identifier_sane = (keyCode: number, keyIdentifier?: string) => {

  // Missing identifier is not sane
  if (!keyIdentifier) {
    return false;
  }


  // Assume non-Unicode keyIdentifier values are sane
  let unicodePrefixLocation = keyIdentifier.indexOf("U+");
  if (unicodePrefixLocation === -1) {
    return true;
  }


  // If the Unicode codepoint isn't identical to the keyCode,
  // then the identifier is likely correct
  let codepoint = parseInt(keyIdentifier.substring(unicodePrefixLocation + 2), 16);
  if (keyCode !== codepoint) {
    return true;
  }


  // The keyCodes for A-Z and 0-9 are actually identical to their
  // Unicode codepoints
  if ((keyCode >= 65 && keyCode <= 90) || (keyCode >= 48 && keyCode <= 57)) {
    return true;
  }

  // The keyIdentifier does NOT appear sane
  return false;
};
export {
  get_keysym,
  keysym_from_charcode,
  keysym_from_key_identifier,
  isPrintable,
  keysym_from_keycode,
  key_identifier_sane
}