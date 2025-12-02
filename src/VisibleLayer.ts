import Layer from "./Layer";

/**
 *
 * A layer which is visible on the client.
 */
class VisibleLayer extends Layer {
  private _alpha: number = 0xFF;
  private _x: number = 0;
  private _y: number = 0;
  private _z: number = 0;
  private _matrix: number[] = [1, 0, 0, 1, 0, 0];

  private _parent?: VisibleLayer;

  private readonly element: HTMLDivElement;

  private __translate = "translate(0px, 0px)";
  private __matrix = "matrix(1, 0, 0, 1, 0, 0)";
  public static __next_id: number = 0;

  private __unique_id = VisibleLayer.__next_id++

  private children: Record<number, VisibleLayer>;

  constructor(width: number, height: number) {
    super(width, height);
    this.children = {};
    const canvas = this.getCanvas();
    canvas.style.position = "absolute";
    canvas.style.left = "0px";
    canvas.style.top = "0px";

    // Create div with given size
    let div = document.createElement("div");
    div.appendChild(canvas);
    div.style.width = width + "px";
    div.style.height = height + "px";
    div.style.position = "absolute";
    div.style.left = "0px";
    div.style.top = "0px";
    div.style.overflow = "hidden";
    let __super_resize = super.resize;
    this.resize = (width, height) => {

      // Resize containing div
      div.style.width = width + "px";
      div.style.height = height + "px";
      __super_resize(width, height);
    };

    this.element = div;
  }

  getElement(): HTMLElement {
    return this.element;
  }

  translate(x: number, y: number): void {
    this.x = x;
    this.y = y;

    // Generate translation
    this.__translate = "translate(" + x + "px," + y + "px)";

    // Set layer transform
    this.element.style.transform = this.__translate + " " + this.__matrix;
  }

  move(parent: VisibleLayer, x: number, y: number, z: number): void {
    // Set parent if necessary
    if (this.parent !== parent) {

      // Maintain relationship
      if (this.parent) {
        delete this.parent.children[this.__unique_id];
      }

      this.parent = parent;
      parent.children[this.__unique_id] = this;

      // Reparent element
      let parent_element = parent.getElement();
      parent_element.appendChild(this.element);

    }

    // Set location
    this.translate(x, y);
    this.z = z;
    this.element.style.zIndex = String(z);
  }

  shade(alpha: number): void {
    this._alpha = alpha;
    this.element.style.opacity = String(alpha / 0xFF);
  }

  dispose(): void {
    // Remove element from parent
    if (this.parent) {
      delete this.parent.children[this.__unique_id];
      this.parent = undefined;
    }
    if (this.element.parentNode)
      this.element.parentNode.removeChild(this.element);
  }

  distort(a: number, b: number, c: number, d: number, e: number, f: number): void {
    // Store matrix
    this.matrix = [a, b, c, d, e, f];

    // Generate matrix transformation
    this.__matrix =
      /* a c e
       * b d f
       * 0 0 1
       */

      "matrix(" + a + "," + b + "," + c + "," + d + "," + e + "," + f + ")";

    // Set layer transform
    this.element.style.transform = this.__translate + " " + this.__matrix;
  }

  get alpha(): number {
    return this._alpha;
  }

  get x(): number {
    return this._x;
  }

  get y(): number {
    return this._y;
  }

  get z(): number {
    return this._z;
  }


  set x(value: number) {
    this._x = value;
  }

  set y(value: number) {
    this._y = value;
  }

  set z(value: number) {
    this._z = value;
  }

  get matrix(): number[] {
    return this._matrix;
  }


  set matrix(value: number[]) {
    this._matrix = value;
  }

  get parent(): VisibleLayer | undefined {
    return this._parent;
  }

  set parent(value: VisibleLayer | undefined) {
    this._parent = value;
  }
}

export default VisibleLayer