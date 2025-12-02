/**
 *
 * A hidden input field which attempts to keep itself focused at all times,
 * except when another input field has been intentionally focused, whether
 * programatically or by the user. The actual underlying input field, returned
 * by getElement(), may be used as a reliable source of keyboard-related events,
 * particularly composition and input events which may require a focused input
 * field to be dispatched at all.
 */
class InputSink {
  /**
   * The underlying input field, styled to be invisible.
   */
  private readonly field: HTMLTextAreaElement;

  /**
   * Creates a new InputSink instance with a hidden textarea for capturing keyboard events.
   */
  constructor() {
    // Create hidden textarea
    this.field = document.createElement('textarea');
    this.field.style.position = 'fixed';
    this.field.style.outline = 'none';
    this.field.style.border = 'none';
    this.field.style.margin = '0';
    this.field.style.padding = '0';
    this.field.style.height = '0';
    this.field.style.width = '0';
    this.field.style.left = '0';
    this.field.style.bottom = '0';
    this.field.style.resize = 'none';
    this.field.style.background = 'transparent';
    this.field.style.color = 'transparent';

    // Keep field clear when modified via normal keypresses
    this.field.addEventListener("keypress", () => {
      this.field.value = '';
    }, false);

    // Keep field clear when modified via composition events
    this.field.addEventListener("compositionend", (e: CompositionEvent) => {
      if (e.data) {
        this.field.value = '';
      }
    }, false);

    // Keep field clear when modified via input events
    this.field.addEventListener("input", (e: Event) => {
      const inputEvent = e as InputEvent;
      if (inputEvent.data && !inputEvent.isComposing) {
        this.field.value = '';
      }
    }, false);

    // Whenever focus is gained, automatically click to ensure cursor is
    // actually placed within the field (the field may simply be highlighted or
    // outlined otherwise)
    this.field.addEventListener("focus", () => {
      setTimeout(() => {
        this.field.click();
        this.field.select();
      }, 0);
    }, true);

    // Automatically refocus input sink if part of DOM
    document.addEventListener("keydown", () => {
      // Do not refocus if focus is on an input field
      const focused = document.activeElement;
      if (focused && focused !== document.body) {
        // Only consider focused input fields which are actually visible
        const rect = focused.getBoundingClientRect();
        if (rect.left + rect.width > 0 && rect.top + rect.height > 0)
          return;
      }

      // Refocus input sink instead of handling click
      this.focus();

    }, true);
  }

  /**
   * Attempts to focus the underlying input field. The focus attempt occurs
   * asynchronously, and may silently fail depending on browser restrictions.
   */
  focus(): void {
    setTimeout(() => {
      this.field.focus(); // Focus must be deferred to work reliably across browsers
    }, 0);
  }

  /**
   * Returns the underlying input field. This input field MUST be manually
   * added to the DOM for the Guacamole.InputSink to have any effect.
   *
   * @returns The underlying input field.
   */
  getElement(): HTMLTextAreaElement {
    return this.field;
  }
}

export default InputSink;