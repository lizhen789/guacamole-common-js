
/**
 * @fileoverview Represents a position in 2-D space.
 */
class Position {
  private template: Partial<Position>;
  /**
   * The current X position, in pixels.
   */
  x: number;

  /**
   * The current Y position, in pixels.
   */
  y: number;

  /**
   * Creates a new Position with the given template position.
   *
   * @param template The object whose properties should be copied within the new Position.
   */
  constructor(template?: Partial<Position>) {
    this.template = template || {};
    this.x = this.template.x || 0;
    this.y = this.template.y || 0;
  }

  /**
   * Assigns the position represented by the given element and
   * clientX/clientY coordinates. The clientX and clientY coordinates are
   * relative to the browser viewport and are commonly available within
   * JavaScript event objects. The final position is translated to
   * coordinates that are relative the given element.
   *
   * @param element The element the coordinates should be relative to.
   * @param clientX The viewport-relative X coordinate to translate.
   * @param clientY The viewport-relative Y coordinate to translate.
   */
  fromClientPosition(element: HTMLElement, clientX: number, clientY: number): void {
    this.x = clientX - element.offsetLeft;
    this.y = clientY - element.offsetTop;

    // This is all JUST so we can get the position within the element
    let parent: HTMLElement = element.offsetParent as HTMLElement;
    while (parent && parent !== document.body) {
      this.x -= parent.offsetLeft - parent.scrollLeft;
      this.y -= parent.offsetTop - parent.scrollTop;
      parent = parent.offsetParent as HTMLElement;
    }

    // Element ultimately depends on positioning within document body,
    // take document scroll into account.
    if (parent) {
      const documentScrollLeft = document.body.scrollLeft || document.documentElement.scrollLeft;
      const documentScrollTop = document.body.scrollTop || document.documentElement.scrollTop;

      this.x -= parent.offsetLeft - documentScrollLeft;
      this.y -= parent.offsetTop - documentScrollTop;
    }
  }

  /**
   * Returns a new Position representing the relative position
   * of the given clientX/clientY coordinates within the given element. The
   * clientX and clientY coordinates are relative to the browser viewport and are
   * commonly available within JavaScript event objects. The final position is
   * translated to coordinates that are relative the given element.
   *
   * @param element The element the coordinates should be relative to.
   * @param clientX The viewport-relative X coordinate to translate.
   * @param clientY The viewport-relative Y coordinate to translate.
   * @returns A new Position representing the relative position of the given
   *     client coordinates.
   */
  static fromClientPosition(element: HTMLElement, clientX: number, clientY: number): Position {
    const position = new Position();
    position.fromClientPosition(element, clientX, clientY);
    return position;
  }
}

export default Position;