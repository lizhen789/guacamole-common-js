import {Pixel} from "./Layer";

const DefaultTransferFunction = {
  /* BLACK */
  0x0: function (_src: Pixel, dst: Pixel) {
    dst.red = dst.green = dst.blue = 0x00;
  },

  /* WHITE */
  0xF: function (_src: Pixel, dst: Pixel) {
    dst.red = dst.green = dst.blue = 0xFF;
  },

  /* SRC */
  0x3: function (src: Pixel, dst: Pixel) {
    dst.red = src.red;
    dst.green = src.green;
    dst.blue = src.blue;
    dst.alpha = src.alpha;
  },

  /* DEST (no-op) */
  0x5: function (_src: Pixel, _dst: Pixel) {
    // Do nothing
  },

  /* Invert SRC */
  0xC: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & ~src.red;
    dst.green = 0xFF & ~src.green;
    dst.blue = 0xFF & ~src.blue;
    dst.alpha = src.alpha;
  },

  /* Invert DEST */
  0xA: function (_src: Pixel, dst: Pixel) {
    dst.red = 0xFF & ~dst.red;
    dst.green = 0xFF & ~dst.green;
    dst.blue = 0xFF & ~dst.blue;
  },

  /* AND */
  0x1: function (src: Pixel, dst: Pixel) {
    dst.red = (src.red & dst.red);
    dst.green = (src.green & dst.green);
    dst.blue = (src.blue & dst.blue);
  },

  /* NAND */
  0xE: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & ~(src.red & dst.red);
    dst.green = 0xFF & ~(src.green & dst.green);
    dst.blue = 0xFF & ~(src.blue & dst.blue);
  },

  /* OR */
  0x7: function (src: Pixel, dst: Pixel) {
    dst.red = (src.red | dst.red);
    dst.green = (src.green | dst.green);
    dst.blue = (src.blue | dst.blue);
  },

  /* NOR */
  0x8: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & ~(src.red | dst.red);
    dst.green = 0xFF & ~(src.green | dst.green);
    dst.blue = 0xFF & ~(src.blue | dst.blue);
  },

  /* XOR */
  0x6: function (src: Pixel, dst: Pixel) {
    dst.red = (src.red ^ dst.red);
    dst.green = (src.green ^ dst.green);
    dst.blue = (src.blue ^ dst.blue);
  },

  /* XNOR */
  0x9: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & ~(src.red ^ dst.red);
    dst.green = 0xFF & ~(src.green ^ dst.green);
    dst.blue = 0xFF & ~(src.blue ^ dst.blue);
  },

  /* AND inverted source */
  0x4: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & (~src.red & dst.red);
    dst.green = 0xFF & (~src.green & dst.green);
    dst.blue = 0xFF & (~src.blue & dst.blue);
  },

  /* OR inverted source */
  0xD: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & (~src.red | dst.red);
    dst.green = 0xFF & (~src.green | dst.green);
    dst.blue = 0xFF & (~src.blue | dst.blue);
  },

  /* AND inverted destination */
  0x2: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & (src.red & ~dst.red);
    dst.green = 0xFF & (src.green & ~dst.green);
    dst.blue = 0xFF & (src.blue & ~dst.blue);
  },

  /* OR inverted destination */
  0xB: function (src: Pixel, dst: Pixel) {
    dst.red = 0xFF & (src.red | ~dst.red);
    dst.green = 0xFF & (src.green | ~dst.green);
    dst.blue = 0xFF & (src.blue | ~dst.blue);
  }
}
type DefaultTransferFunctionType = keyof  typeof DefaultTransferFunction
export {
  DefaultTransferFunctionType
}
export default DefaultTransferFunction