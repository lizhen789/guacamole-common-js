import Position from "../Position";

class TouchState extends Position {
  private readonly _id: number;
  private _radiusX: number;
  private _radiusY: number;
  private _angle: number;
  private _force: number;

  constructor(template?: Partial<TouchState>) {
    template = template || {} as TouchState;
    super(template);
    this._id = template.id || 0;
    this._radiusX = template.radiusX || 0;
    this._radiusY = template.radiusY || 0;
    this._angle = template.angle || 0;
    this._force = template.force || 0;
  }


  get id(): number {
    return this._id;
  }

  get radiusX(): number {
    return this._radiusX;
  }

  get radiusY(): number {
    return this._radiusY;
  }

  get angle(): number {
    return this._angle;
  }

  get force(): number {
    return this._force;
  }


  set radiusX(value: number) {
    this._radiusX = value;
  }

  set radiusY(value: number) {
    this._radiusY = value;
  }

  set angle(value: number) {
    this._angle = value;
  }

  set force(value: number) {
    this._force = value;
  }
}

export default TouchState