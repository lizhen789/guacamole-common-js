import Layer, {Pixel} from './Layer';
import VisibleLayer from './VisibleLayer';
import DisplayFrame from './DisplayFrame';
import DisplayTask from './DisplayTask';
import InputStream from './InputStream';
import DataURIReader from './DataURIReader';
import BlobReader from './BlobReader';


/**
 * The Guacamole display. The display does not deal with the Guacamole
 * protocol, and instead implements a set of graphical operations which
 * embody the set of operations present in the protocol. The order operations
 * are executed is guaranteed to be in the same order as their corresponding
 * functions are called.
 */
class Display {
  /**
   * The main display element container.
   */
  private readonly display: HTMLDivElement;

  /**
   * The bounds container for the display.
   */
  private readonly bounds: HTMLDivElement;

  /**
   * The default layer of the display.
   */
  private readonly default_layer: VisibleLayer;

  /**
   * The cursor layer of the display.
   */
  private readonly cursor: VisibleLayer;

  /**
   * The width of the display in pixels.
   */
  private displayWidth: number;

  /**
   * The height of the display in pixels.
   */
  private displayHeight: number;

  /**
   * The scale factor of the display.
   */
  private displayScale: number;

  /**
   * The X coordinate of the hotspot of the mouse cursor.
   */
  private cursorHotspotX: number;

  /**
   * The Y coordinate of the hotspot of the mouse cursor.
   */
  private cursorHotspotY: number;

  /**
   * The current X coordinate of the local mouse cursor.
   */
  private cursorX: number;

  /**
   * The current Y coordinate of the local mouse cursor.
   */
  private cursorY: number;

  private tasks: DisplayTask[] = [];
  private readonly frames: DisplayFrame[] = [];
  onResize?: (width: number, height: number) => void;
  onCursor?: (canvas: HTMLCanvasElement, width: number, height: number) => void;

  /**
   * @constructor
   */
  constructor() {
    this.displayWidth = 0;
    this.displayHeight = 0;
    this.displayScale = 1;
    this.cursorHotspotX = 0;
    this.cursorHotspotY = 0;
    this.cursorX = 0;
    this.cursorY = 0;

    // Create display container
    this.display = document.createElement('div');
    this.display.style.position = 'relative';
    this.display.style.width = this.displayWidth + 'px';
    this.display.style.height = this.displayHeight + 'px';

    // Ensure transformations origin
    this.display.style.transformOrigin = '0 0';

    // Create default layer
    this.default_layer = new VisibleLayer(this.displayWidth, this.displayHeight);

    // Create cursor layer
    this.cursor = new VisibleLayer(0, 0);
    this.cursor.setChannelMask(Layer.SRC); // SRC channel

    // Add layers to display
    this.display.appendChild(this.default_layer.getElement());
    this.display.appendChild(this.cursor.getElement());

    // Create bounding div
    this.bounds = document.createElement('div');
    this.bounds.style.position = 'relative';
    this.bounds.style.width = (this.displayWidth * this.displayScale) + 'px';
    this.bounds.style.height = (this.displayHeight * this.displayScale) + 'px';

    // Add display to bounds
    this.bounds.appendChild(this.display);
  }

  private flushFrames() {
    let rendered_frames = 0;

    // Draw all pending frames, if ready
    while (rendered_frames < this.frames.length) {

      let frame = this.frames[rendered_frames];
      if (!frame.isReady()) {
        break;
      }

      frame.flush();
      rendered_frames++;
    }

    // Remove rendered frames from array
    this.frames.splice(0, rendered_frames);
  }

  private scheduleTask(handler: Function, blocked: boolean = false) {
    let task = new DisplayTask(handler, blocked, this.flushFrames.bind(this));
    this.tasks.push(task);
    return task;
  }

  /**
   * Returns the root DOM element of the display.
   *
   * @returns The root DOM element of the display.
   */
  public getElement(): HTMLElement {
    return this.bounds;
  }

  public getWidth() {
    return this.displayWidth;
  }

  public getHeight() {
    return this.displayHeight;
  }

  getDefaultLayer() {
    return this.default_layer;
  }

  getCursorLayer() {
    return this.cursor;
  }

  createLayer() {
    let layer = new VisibleLayer(this.displayWidth, this.displayHeight);
    layer.move(this.default_layer, 0, 0, 0);
    return layer;
  }

  createBuffer() {
    let buffer = new VisibleLayer(0, 0);
    buffer.autosize = true;
    return buffer;
  }

  /**
   * Flushes all pending operations to the display.
   */
  flush(callback: () => void): void {
    // Add frame, reset tasks
    this.frames.push(new DisplayFrame(callback, this.tasks));
    this.tasks = [];

    // Attempt flush
    this.flushFrames();
  }

  setCursor(cursorHotspotX: number, cursorHotspotY: number, layer: Layer, srcX: number, srcY: number, srcWidth: number, srcHeight: number) {
    this.scheduleTask(() => {

      // Set hotspot
      this.cursorHotspotX = cursorHotspotX;
      this.cursorHotspotY = cursorHotspotY;

      // Reset cursor size
      this.cursor.resize(srcWidth, srcHeight);

      // Draw cursor to cursor layer
      this.cursor.copy(layer, srcX, srcY, srcWidth, srcHeight, 0, 0);
      this.moveCursor(this.cursorX, this.cursorY);

      // Fire cursor change event
      if (this.onCursor) {
        this.onCursor(this.cursor.toCanvas(), this.cursorHotspotX, this.cursorHotspotY);
      }
    });
  }

  showCursor(shown: boolean) {
    let element = this.cursor.getElement();
    let parent = element.parentNode;

    // Remove from DOM if hidden
    if (!shown) {
      if (parent) {
        parent.removeChild(element);
      }
    }

    // Otherwise, ensure cursor is child of display
    else if (parent !== this.display) {
      this.display.appendChild(element);
    }
  }

  /**
   * Moves the cursor to the given coordinates.
   *
   * @param x The X coordinate to move the cursor to.
   * @param y The Y coordinate to move the cursor to.
   */
  moveCursor(x: number, y: number): void {
    // Move cursor layer
    this.cursor.translate(x - this.cursorHotspotX, y - this.cursorHotspotY);

    // Update stored position
    this.cursorX = x;
    this.cursorY = y;
  }

  resize(layer: Layer, width: number, height: number) {
    this.scheduleTask(() => {

      layer.resize(width, height);

      // Resize display if default layer is resized
      if (layer === this.default_layer) {

        // Update (set) display size
        this.displayWidth = width;
        this.displayHeight = height;
        this.display.style.width = this.displayWidth + 'px';
        this.display.style.height = this.displayHeight + 'px';

        // Update bounds size
        this.bounds.style.width = (this.displayWidth * this.displayScale) + 'px';
        this.bounds.style.height = (this.displayHeight * this.displayScale) + 'px';

        // Notify of resize
        if (this.onResize) {
          this.onResize(width, height);
        }
      }
    });
  }

  public drawImage(layer: Layer, x: number, y: number, image: ImageBitmap | HTMLImageElement) {
    this.scheduleTask(() => {
      layer.drawImage(x, y, image);
    });
  }

  public drawBlob(layer: Layer, x: number, y: number, blob: Blob) {
    let task: DisplayTask | undefined;

    // Prefer createImageBitmap() over blob URLs if available
    if (window.createImageBitmap) {
      let bitmap: ImageBitmap | undefined;
      // Draw image once loaded
      task = this.scheduleTask(() => {
        bitmap && layer.drawImage(x, y, bitmap);
      }, true);

      // Load image from provided blob
      window.createImageBitmap(blob).then(function bitmapLoaded(decoded) {
        bitmap = decoded;
        task?.unblock();
      });
    }

      // Use blob URLs and the Image object if createImageBitmap() is
    // unavailable
    else {
      // Create URL for blob
      let url = URL.createObjectURL(blob);

      // Draw and free blob URL when ready
      task = this.scheduleTask(() => {
        // Draw the image only if it loaded without errors
        if (image && image.width && image.height) {
          layer.drawImage(x, y, image);
        }

        // Blob URL no longer needed
        URL.revokeObjectURL(url);
      }, true);

      // Load image from URL
      let image = new Image();
      image.onload = task.unblock;
      image.onerror = task.unblock;
      image.src = url;
    }
  }

  drawStream(layer: Layer, x: number, y: number, stream: InputStream, mimetype: string) {
    // If createImageBitmap() is available, load the image as a blob so
    // that function can be used
    if (window.createImageBitmap !== undefined) {
      let reader = new BlobReader(stream, mimetype);
      reader.onEnd = () => {
        this.drawBlob(layer, x, y, reader.getBlob());
      };
    }

      // Lacking createImageBitmap(), fall back to data URIs and the Image
    // object
    else {
      let reader = new DataURIReader(stream, mimetype);
      reader.onEnd = () => {
        this.draw(layer, x, y, reader.getURI());
      };
    }
  }

  draw(layer: Layer, x: number, y: number, url: string) {
    let task = this.scheduleTask(() => {

      // Draw the image only if it loaded without errors
      if (image.width && image.height)
        layer.drawImage(x, y, image);
    }, true);

    let image = new Image();
    image.onload = task.unblock;
    image.onerror = task.unblock;
    image.src = url;
  }

  play(layer: Layer, mimetype: string, _duration: number, url: string) {
    // Start loading the video
    let video = document.createElement('video');
    video.setAttribute('type', mimetype);
    video.src = url;

    // Start copying frames when playing
    video.addEventListener('play', function () {
      function render_callback() {
        layer.drawImage(0, 0, video);
        if (!video.ended) {
          window.setTimeout(render_callback, 20);
        }
      }

      render_callback();
    }, false);

    this.scheduleTask(video.play);
  }

  transfer(srcLayer: Layer, srcX: number, srcY: number, srcWidth: number, srcHeight: number, dstLayer: Layer, dstX: number, dstY: number, transferFunction: ((src: Pixel, dst: Pixel) => void)) {
    this.scheduleTask(() => {
      dstLayer.transfer(srcLayer, srcX, srcY, srcWidth, srcHeight, dstX, dstY, transferFunction);
    });
  }

  put(srcLayer: Layer, srcX: number, srcY: number, srcWidth: number, srcHeight: number, dstLayer: Layer, dstX: number, dstY: number) {
    this.scheduleTask(() => {
      dstLayer.put(srcLayer, srcX, srcY, srcWidth, srcHeight, dstX, dstY);
    });
  }

  copy(srcLayer: Layer, srcX: number, srcY: number, srcWidth: number, srcHeight: number, dstLayer: Layer, dstX: number, dstY: number) {
    this.scheduleTask(() => {
      dstLayer.copy(srcLayer, srcX, srcY, srcWidth, srcHeight, dstX, dstY);
    });
  }

  moveTo(layer: Layer, x: number, y: number) {
    this.scheduleTask(() => {
      layer.moveTo(x, y);
    });
  }

  lineTo(layer: Layer, x: number, y: number) {
    this.scheduleTask(() => {
      layer.lineTo(x, y);
    });
  }

  arc(layer: Layer, x: number, y: number, radius: number, startAngle: number, endAngle: number, negative: boolean) {
    this.scheduleTask(function __display_arc() {
      layer.arc(x, y, radius, startAngle, endAngle, negative);
    });
  }

  curveTo(layer: Layer, cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this.scheduleTask(() => {
      layer.curveTo(cp1x, cp1y, cp2x, cp2y, x, y);
    });
  }

  close(layer: Layer) {
    this.scheduleTask(() => {
      layer.close();
    });
  }

  rect(layer: Layer, x: number, y: number, w: number, h: number) {
    this.scheduleTask(() => {
      layer.rect(x, y, w, h);
    });
  }

  clip(layer: Layer) {
    this.scheduleTask(() => {
      layer.clip();
    });
  }

  strokeColor(layer: Layer, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, r: number, g: number, b: number, a: number) {
    this.scheduleTask(() => {
      layer.strokeColor(cap, join, thickness, r, g, b, a);
    });
  }

  fillColor(layer: Layer, r: number, g: number, b: number, a: number) {
    this.scheduleTask(() => {
      layer.fillColor(r, g, b, a);
    });
  }

  strokeLayer(layer: Layer, cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, srcLayer: Layer) {
    this.scheduleTask(() => {
      layer.strokeLayer(cap, join, thickness, srcLayer);
    });
  }

  fillLayer(layer: Layer, srcLayer: Layer) {
    this.scheduleTask(() => {
      layer.fillLayer(srcLayer);
    });
  }

  push(layer: Layer) {
    this.scheduleTask(() => {
      layer.push();
    });
  }

  pop(layer: Layer) {
    this.scheduleTask(() => {
      layer.pop();
    });
  }

  reset(layer: Layer) {
    this.scheduleTask(() => {
      layer.reset();
    });
  }

  setTransform(layer: Layer, a: number, b: number, c: number, d: number, e: number, f: number) {
    this.scheduleTask(() => {
      layer.setTransform(a, b, c, d, e, f);
    });
  }

  transform(layer: Layer, a: number, b: number, c: number, d: number, e: number, f: number) {
    this.scheduleTask(() => {
      layer.transform(a, b, c, d, e, f);
    });
  }

  setChannelMask(layer: Layer, mask: number) {
    this.scheduleTask(() => {
      layer.setChannelMask(mask);
    });
  }

  setMiterLimit(layer: Layer, limit: number) {
    this.scheduleTask(() => {
      layer.setMiterLimit(limit);
    });
  }

  dispose(layer: VisibleLayer) {
    this.scheduleTask(() => {
      layer.dispose();
    });
  }

  distort(layer: VisibleLayer, a: number, b: number, c: number, d: number, e: number, f: number) {
    this.scheduleTask(function distortLayer() {
      layer.distort(a, b, c, d, e, f);
    });
  }

  move(layer: VisibleLayer, parent: VisibleLayer, x: number, y: number, z: number) {
    this.scheduleTask(() => {
      layer.move(parent, x, y, z);
    });
  }

  shade(layer: VisibleLayer, alpha: number) {
    this.scheduleTask(() => {
      layer.shade(alpha);
    });
  }

  scale(scale: number) {
    this.display.style.transform = 'scale(' + scale + ',' + scale + ')';
    this.displayScale = scale;
    // Update bounds size
    this.bounds.style.width = (this.displayWidth * this.displayScale) + 'px';
    this.bounds.style.height = (this.displayHeight * this.displayScale) + 'px';
  }

  getScale(): number {
    return this.displayScale;
  }

  private get_children(layer: VisibleLayer) {

    // Build array of children
    let children: VisibleLayer[] = [];
    for (let index in layer.children) {
      children.push(layer.children[index]);
    }


    // Sort
    children.sort((a, b) => {

      // Compare based on Z order
      let diff = a.z - b.z;
      if (diff !== 0)
        return diff;

      // If Z order identical, use document order
      let a_element = a.getElement();
      let b_element = b.getElement();
      let position = b_element.compareDocumentPosition(a_element);

      if (position & Node.DOCUMENT_POSITION_PRECEDING) return -1;
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return 1;

      // Otherwise, assume same
      return 0;
    });

    // Done
    return children;
  }

  private draw_layer(layer: VisibleLayer, x: number, y: number) {
    // Get destination canvas
    let canvas = document.createElement('canvas');
    canvas.width = this.default_layer.width;
    canvas.height = this.default_layer.height;
    let context: CanvasRenderingContext2D = canvas.getContext('2d')!;

    // Draw layer
    if (layer.width > 0 && layer.height > 0) {

      // Save and update alpha
      let initial_alpha = context.globalAlpha;
      context.globalAlpha *= layer.alpha / 255.0;

      // Copy data
      context.drawImage(layer.getCanvas(), x, y);

      // Draw all children
      let children = this.get_children(layer);
      for (let i = 0; i < children.length; i++) {
        let child = children[i];
        this.draw_layer(child, x + child.x, y + child.y);
      }

      // Restore alpha
      context.globalAlpha = initial_alpha;

    }
    return canvas;
  }

  flatten() {
    return this.draw_layer(this.default_layer, 0, 0);
  }


}

// 导出类供其他模块使用
export default Display;