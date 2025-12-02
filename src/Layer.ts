/**
 * 表示单个图像像素的数据。所有组件的最小值为0，最大值为255。
 */
export interface Pixel {
  /**
   * 像素的红色分量，范围从0到255。
   */
  red: number;

  /**
   * 像素的绿色分量，范围从0到255。
   */
  green: number;

  /**
   * 像素的蓝色分量，范围从0到255。
   */
  blue: number;

  /**
   * 像素的alpha分量，范围从0到255。
   */
  alpha: number;
}

/**
 * 抽象有序绘图表面。每个Layer包含一个canvas元素并提供简单的绘图指令，
 * 与canvas元素不同，Layer上的绘图操作保证按顺序运行，即使操作需要等待图像加载才能完成。
 */
class Layer {
  /**
   * 合成操作"rout"的通道掩码
   */
  public static readonly ROUT = 0x2;
  /**
   * 合成操作"atop"的通道掩码。
   */
  public static readonly ATOP = 0x6;
  /**
   * 合成操作"xor"的通道掩码。
   */
  public static readonly XOR = 0xA;
  /**
   * 合成操作"rover"的通道掩码。
   */
  public static readonly ROVER = 0xB;
  /**
   * 合成操作"over"的通道掩码。
   */
  public static readonly OVER = 0xE;
  /**
   * 合成操作"plus"的通道掩码。
   */
  public static readonly PLUS = 0xF;
  /**
   * 合成操作"rin"的通道掩码。
   */
  public static readonly RIN = 0x1;
  /**
   * 合成操作"in"的通道掩码。
   */
  public static readonly IN = 0x4;
  /**
   * 合成操作"out"的通道掩码。
   */
  public static readonly OUT = 0x8;
  /**
   * 合成操作"ratop"的通道掩码。
   */
  public static readonly RATOP = 0x9;
  /**
   * 合成操作"src"的通道掩码。
   */
  public static readonly SRC = 0xC;
  /**
   * 参考当前Layer实例。
   */
  private layer: Layer;

  /**
   * 层的宽度或高度必须变化的像素数，之后才会调整底层canvas的大小。
   * 底层canvas将保持为这个因子的整数倍尺寸。
   */
  private static readonly CANVAS_SIZE_FACTOR: number = 64;

  /**
   * 此Layer的底层canvas元素。
   */
  private readonly canvas: HTMLCanvasElement;

  /**
   * 底层canvas元素的2D显示上下文。
   */
  private context: CanvasRenderingContext2D;

  /**
   * 标记层是否尚未被绘制。一旦调用任何影响底层canvas的绘制操作，此标志将被设置为false。
   */
  private empty: boolean = true;

  /**
   * 标记是否应该用下一个路径绘制操作开始一个新路径。
   */
  private pathClosed: boolean = true;

  /**
   * 状态栈上的状态数量。
   * 注意，栈上总是有一个元素，但该元素不可见，仅用于将层重置到初始状态。
   */
  private stackSize: number = 0;

  /**
   * Guacamole通道掩码到HTML5 canvas合成操作名称的映射。目前并非所有通道掩码组合都已实现。
   */
  private compositeOperation: Record<number, GlobalCompositeOperation> = {
    /* 0x0 未实现 */
    0x1: "destination-in",
    0x2: "destination-out",
    /* 0x3 未实现 */
    0x4: "source-in",
    /* 0x5 未实现 */
    0x6: "source-atop",
    /* 0x7 未实现 */
    0x8: "source-out",
    0x9: "destination-atop",
    0xA: "xor",
    0xB: "destination-over",
    0xC: "copy",
    /* 0xD 未实现 */
    0xE: "source-over",
    0xF: "lighter"
  };

  /**
   * 当设置为true时，Layer应自动调整大小以适应任何绘图操作的维度，否则为false（默认）。
   */
  public autosize: boolean = false;

  /**
   * 此层的当前宽度。
   */
  public width: number;

  /**
   * 此层的当前高度。
   */
  public height: number;

  /**
   * @constructor
   *
   * @param width 层的宽度（以像素为单位）。支持此Layer的canvas元素将被赋予此宽度。
   * @param height 层的高度（以像素为单位）。支持此Layer的canvas元素将被赋予此高度。
   */
  constructor(width: number, height: number) {
    this.layer = this;
    this.width = width;
    this.height = height;

    // 创建canvas元素并获取上下文
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d")!;
    this.context.save();

    // 初始化canvas尺寸
    this.resizeInternal(width, height);

    // 显式将canvas渲染在层中其他元素（如子层）下方
    this.canvas.style.zIndex = "-1";
  }


  /**
   * 将此Layer的大小更改为给定的宽度和高度。仅当提供的新大小与当前大小实际不同时才尝试调整大小。
   *
   * @param newWidth 要分配给此Layer的新宽度。
   * @param newHeight 要分配给此Layer的新高度。
   */
  public resize(newWidth: number, newHeight: number): void {
    newWidth = newWidth ?? 0;
    newHeight = newHeight ?? 0;
    if (newWidth !== this.layer.width || newHeight !== this.layer.height) {
      this.resizeInternal(newWidth, newHeight);
    }
  }


  /**
   * 给定矩形左上角的X和Y坐标以及矩形的宽度和高度，根据需要调整底层canvas元素的大小，
   * 以确保矩形适合canvas元素的坐标空间。此函数只会使canvas变大。
   * 如果矩形已经适合canvas元素的坐标空间，则canvas保持不变。
   *
   * @private
   * @param x 要适应的矩形左上角的X坐标。
   * @param y 要适应的矩形左上角的Y坐标。
   * @param w 要适应的矩形的宽度。
   * @param h 要适应的矩形的高度。
   */
  private fitRect(x: number, y: number, w: number, h: number): void {
    // 计算边界
    const opBoundX = w + x;
    const opBoundY = h + y;

    // 确定最大宽度
    let resizeWidth: number;
    if (opBoundX > this.layer.width) {
      resizeWidth = opBoundX;
    } else {
      resizeWidth = this.layer.width;
    }

    // 确定最大高度
    let resizeHeight: number;
    if (opBoundY > this.layer.height) {
      resizeHeight = opBoundY;
    } else {
      resizeHeight = this.layer.height;
    }

    // 必要时调整大小
    this.resize(resizeWidth, resizeHeight);
  }

  /**
   * 返回支持此Layer的canvas元素。请注意，canvas的尺寸可能与Layer的尺寸不完全匹配，
   * 因为在保持canvas状态的同时调整其大小是一项昂贵的操作。
   *
   * @returns 支持此Layer的canvas元素。
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * 返回一个包含与该Layer相同图像的新canvas元素。
   * 与getCanvas()不同，返回的canvas元素保证与Layer的尺寸完全相同。
   *
   * @returns 包含此Layer图像内容副本的新canvas元素。
   */
  public toCanvas(): HTMLCanvasElement {
    // 创建具有相同尺寸的新canvas
    const canvas = document.createElement('canvas');
    canvas.width = this.layer.width;
    canvas.height = this.layer.height;

    // 将图像内容复制到新canvas
    const context = canvas.getContext('2d')!;
    context.drawImage(this.layer.getCanvas(), 0, 0);

    return canvas;
  }

  /**
   * 调整支持此Layer的canvas元素的大小。此函数仅应在内部使用。
   *
   * @private
   * @param newWidth 要分配给此Layer的新宽度。
   * @param newHeight 要分配给此Layer的新高度。
   */
  private resizeInternal(newWidth: number = 0, newHeight: number = 0): void {
    // 计算内部canvas的新尺寸
    const canvasWidth = Math.ceil(newWidth / Layer.CANVAS_SIZE_FACTOR) * Layer.CANVAS_SIZE_FACTOR;
    const canvasHeight = Math.ceil(newHeight / Layer.CANVAS_SIZE_FACTOR) * Layer.CANVAS_SIZE_FACTOR;

    // 仅在canvas尺寸实际变化时调整大小
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      // 仅在相关且非空时复制旧数据
      let oldData: HTMLCanvasElement | null = null;
      if (!this.empty && this.canvas.width !== 0 && this.canvas.height !== 0) {
        // 创建用于保存旧数据的canvas和上下文
        oldData = document.createElement("canvas");
        oldData.width = Math.min(this.layer.width, newWidth);
        oldData.height = Math.min(this.layer.height, newHeight);

        const oldDataContext = oldData.getContext("2d")!;

        // 从当前canvas复制图像数据
        oldDataContext.drawImage(this.canvas, 0, 0, oldData.width, oldData.height, 0, 0, oldData.width, oldData.height);
      }

      // 保存合成操作
      const oldCompositeOperation = this.context.globalCompositeOperation;

      // 调整canvas大小
      this.canvas.width = canvasWidth;
      this.canvas.height = canvasHeight;

      // 重新绘制旧数据（如果有）
      if (oldData) {
        this.context.drawImage(oldData, 0, 0, oldData.width, oldData.height, 0, 0, oldData.width, oldData.height);
      }

      // 恢复合成操作
      this.context.globalCompositeOperation = oldCompositeOperation;

      // 确认栈重置（在canvas调整大小时发生）
      this.stackSize = 0;
      this.context.save();
    }
    // 如果canvas大小没有变化，手动强制状态重置
    else {
      this.reset();
    }

    // 分配新的层尺寸
    this.layer.width = newWidth;
    this.layer.height = newHeight;
  }



  /**
   * 在给定坐标处绘制指定图像。指定的图像必须已经加载。
   *
   * @param x 目标X坐标。
   * @param y 目标Y坐标。
   * @param image 要绘制的图像。注意这不是URL。
   */
  public drawImage(x: number, y: number, image: CanvasImageSource): void {
    if (this.layer.autosize) {
      this.fitRect(x, y, (image as HTMLImageElement).width || 0, (image as HTMLImageElement).height || 0);
    }
    this.context.drawImage(image, x, y);
    this.empty = false;
  }
  /**
   * 使用指定的传递函数将图像数据的矩形从一个Layer传输到此Layer。
   *
   * @param srcLayer 要复制图像数据的源Layer。
   * @param srcx 要从中复制数据的源Layer坐标空间中矩形左上角的X坐标。
   * @param srcy 要从中复制数据的源Layer坐标空间中矩形左上角的Y坐标。
   * @param srcw 要从中复制数据的源Layer坐标空间中矩形的宽度。
   * @param srch 要从中复制数据的源Layer坐标空间中矩形的高度。
   * @param x 目标X坐标。
   * @param y 目标Y坐标。
   * @param transferFunction 用于将数据从源传输到目标的传递函数。
   */
  public transfer(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, x: number, y: number, transferFunction: (srcPixel: Pixel, dstPixel: Pixel) => void): void {
    const srcCanvas = srcLayer.getCanvas();

    // 如果整个矩形在源canvas之外，则停止
    if (srcx >= srcCanvas.width || srcy >= srcCanvas.height) return;

    // 否则，将矩形裁剪到区域
    if (srcx + srcw > srcCanvas.width) {
      srcw = srcCanvas.width - srcx;
    }

    if (srcy + srch > srcCanvas.height) {
      srch = srcCanvas.height - srcy;
    }

    // 如果没有要绘制的内容，则停止
    if (srcw === 0 || srch === 0) return;

    if (this.layer.autosize) {
      this.fitRect(x, y, srcw, srch);
    }

    // 从源和目标获取图像数据
    const src = srcLayer.getCanvas().getContext("2d")!.getImageData(srcx, srcy, srcw, srch);
    const dst = this.context.getImageData(x, y, srcw, srch);

    // 为每个像素应用传递函数
    for (let i = 0; i < srcw * srch * 4; i += 4) {
      // 获取源像素环境
      const src_pixel: Pixel = {
        red: src.data[i],
        green: src.data[i + 1],
        blue: src.data[i + 2],
        alpha: src.data[i + 3]
      };

      // 获取目标像素环境
      const dst_pixel: Pixel = {
        red: dst.data[i],
        green: dst.data[i + 1],
        blue: dst.data[i + 2],
        alpha: dst.data[i + 3]
      };

      // 应用传递函数
      transferFunction(src_pixel, dst_pixel);

      // 保存像素数据
      dst.data[i] = dst_pixel.red;
      dst.data[i + 1] = dst_pixel.green;
      dst.data[i + 2] = dst_pixel.blue;
      dst.data[i + 3] = dst_pixel.alpha;
    }

    // 绘制图像数据
    this.context.putImageData(dst, x, y);
    this.empty = false;
  }

  /**
   * 直接将图像数据的矩形从一个Layer复制到此Layer，不执行任何alpha混合，仅复制数据。
   *
   * @param srcLayer 要复制图像数据的源Layer。
   * @param srcx 要从中复制数据的源Layer坐标空间中矩形左上角的X坐标。
   * @param srcy 要从中复制数据的源Layer坐标空间中矩形左上角的Y坐标。
   * @param srcw 要从中复制数据的源Layer坐标空间中矩形的宽度。
   * @param srch 要从中复制数据的源Layer坐标空间中矩形的高度。
   * @param x 目标X坐标。
   * @param y 目标Y坐标。
   */
  public put(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, x: number, y: number): void {
    const srcCanvas = srcLayer.getCanvas();

    // 如果整个矩形在源canvas之外，则停止
    if (srcx >= srcCanvas.width || srcy >= srcCanvas.height) return;

    // 否则，将矩形裁剪到区域
    if (srcx + srcw > srcCanvas.width) {
      srcw = srcCanvas.width - srcx;
    }

    if (srcy + srch > srcCanvas.height) {
      srch = srcCanvas.height - srcy;
    }

    // 如果没有要绘制的内容，则停止
    if (srcw === 0 || srch === 0) return;

    if (this.layer.autosize) {
      this.fitRect(x, y, srcw, srch);
    }

    // 从源获取图像数据并直接放入目标
    const src = srcLayer.getCanvas().getContext("2d")!.getImageData(srcx, srcy, srcw, srch);
    this.context.putImageData(src, x, y);
    this.empty = false;
  }

  /**
   * 复制图像数据的矩形从一个Layer到这个Layer。此操作将复制所有在调用此函数时
   * 源Layer上待处理的操作完成后将绘制的确切图像数据。即使源Layer的autosize属性设置为true，
   * 此操作也不会改变源Layer的大小。
   *
   * @param srcLayer 要复制图像数据的源Layer。
   * @param srcx 要从中复制数据的源Layer坐标空间中矩形左上角的X坐标。
   * @param srcy 要从中复制数据的源Layer坐标空间中矩形左上角的Y坐标。
   * @param srcw 要从中复制数据的源Layer坐标空间中矩形的宽度。
   * @param srch 要从中复制数据的源Layer坐标空间中矩形的高度。
   * @param x 目标X坐标。
   * @param y 目标Y坐标。
   */
  public copy(srcLayer: Layer, srcx: number, srcy: number, srcw: number, srch: number, x: number, y: number): void {
    const srcCanvas = srcLayer.getCanvas();

    // 如果整个矩形在源canvas之外，则停止
    if (srcx >= srcCanvas.width || srcy >= srcCanvas.height) return;

    // 否则，将矩形裁剪到区域
    if (srcx + srcw > srcCanvas.width) {
      srcw = srcCanvas.width - srcx;
    }

    if (srcy + srch > srcCanvas.height) {
      srch = srcCanvas.height - srcy;
    }

    // 如果没有要绘制的内容，则停止
    if (srcw === 0 || srch === 0) return;

    if (this.layer.autosize) {
      this.fitRect(x, y, srcw, srch);
    }
    this.context.drawImage(srcCanvas, srcx, srcy, srcw, srch, x, y, srcw, srch);
    this.empty = false;
  }

  /**
   * 在指定点开始新路径。
   *
   * @param x 要绘制的点的X坐标。
   * @param y 要绘制的点的Y坐标。
   */
  public moveTo(x: number, y: number): void {
    // 如果当前路径已关闭，则开始新路径
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.layer.autosize) {
      this.fitRect(x, y, 0, 0);
    }
    this.context.moveTo(x, y);
  }

  /**
   * 将指定线添加到当前路径。
   *
   * @param x 要绘制的线端点的X坐标。
   * @param y 要绘制的线端点的Y坐标。
   */
  public lineTo(x: number, y: number): void {
    // 如果当前路径已关闭，则开始新路径
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.layer.autosize) {
      this.fitRect(x, y, 0, 0);
    }
    this.context.lineTo(x, y);
  }

  /**
   * 将指定弧添加到当前路径。
   *
   * @param x 将包含弧的圆中心的X坐标。
   * @param y 将包含弧的圆中心的Y坐标。
   * @param radius 圆的半径。
   * @param startAngle 弧的起始角度（以弧度为单位）。
   * @param endAngle 弧的结束角度（以弧度为单位）。
   * @param negative 是否应按减小角度的顺序绘制弧。
   */
  public arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, negative: boolean): void {
    // 如果当前路径已关闭，则开始新路径
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.layer.autosize) {
      this.fitRect(x, y, 0, 0);
    }
    this.context.arc(x, y, radius, startAngle, endAngle, negative);
  }

  /**
   * 在指定点开始新路径。
   *
   * @param cp1x 第一个控制点的X坐标。
   * @param cp1y 第一个控制点的Y坐标。
   * @param cp2x 第二个控制点的X坐标。
   * @param cp2y 第二个控制点的Y坐标。
   * @param x 曲线端点的X坐标。
   * @param y 曲线端点的Y坐标。
   */
  public curveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    // 如果当前路径已关闭，则开始新路径
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.layer.autosize) {
      this.fitRect(x, y, 0, 0);
    }
    this.context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  /**
   * 通过用直线连接终点和起点（如果有）来关闭当前路径。
   */
  public close(): void {
    this.context.closePath();
    this.pathClosed = true;
  }

  /**
   * 将指定矩形添加到当前路径。
   *
   * @param x 要绘制的矩形左上角的X坐标。
   * @param y 要绘制的矩形左上角的Y坐标。
   * @param w 要绘制的矩形的宽度。
   * @param h 要绘制的矩形的高度。
   */
  public rect(x: number, y: number, w: number, h: number): void {
    // 如果当前路径已关闭，则开始新路径
    if (this.pathClosed) {
      this.context.beginPath();
      this.pathClosed = false;
    }

    if (this.layer.autosize) {
      this.fitRect(x, y, w, h);
    }
    this.context.rect(x, y, w, h);
  }

  /**
   * 通过当前路径裁剪所有未来的绘制操作。当前路径隐式关闭。
   * 当前路径可以继续用于其他操作（如fillColor()），但一旦使用路径绘制操作（path()或rect()），将开始新路径。
   */
  public clip(): void {
    // 设置新的裁剪区域
    this.context.clip();
    // 路径现在隐式关闭
    this.pathClosed = true;
  }

  /**
   * 用指定颜色描边当前路径。当前路径隐式关闭。
   * 当前路径可以继续用于其他操作（如clip()），但一旦使用路径绘制操作（path()或rect()），将开始新路径。
   *
   * @param cap 线帽样式。可以是"round"、"square"或"butt"。
   * @param join 线连接样式。可以是"round"、"bevel"或"miter"。
   * @param thickness 线粗细（以像素为单位）。
   * @param r 要填充的颜色的红色分量。
   * @param g 要填充的颜色的绿色分量。
   * @param b 要填充的颜色的蓝色分量。
   * @param a 要填充的颜色的alpha分量。
   */
  public strokeColor(cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, r: number, g: number, b: number, a: number): void {
    // 使用颜色描边
    this.context.lineCap = cap;
    this.context.lineJoin = join;
    this.context.lineWidth = thickness;
    this.context.strokeStyle = `rgba(${r},${g},${b},${a / 255.0})`;
    this.context.stroke();
    this.empty = false;

    // 路径现在隐式关闭
    this.pathClosed = true;
  }

  /**
   * 用指定颜色填充当前路径。当前路径隐式关闭。
   * 当前路径可以继续用于其他操作（如clip()），但一旦使用路径绘制操作（path()或rect()），将开始新路径。
   *
   * @param r 要填充的颜色的红色分量。
   * @param g 要填充的颜色的绿色分量。
   * @param b 要填充的颜色的蓝色分量。
   * @param a 要填充的颜色的alpha分量。
   */
  public fillColor(r: number, g: number, b: number, a: number): void {
    // 使用颜色填充
    this.context.fillStyle = `rgba(${r},${g},${b},${a / 255.0})`;
    this.context.fill();
    this.empty = false;

    // 路径现在隐式关闭
    this.pathClosed = true;
  }

  /**
   * 用指定层中的图像描边当前路径。图像数据将在描边内无限平铺。当前路径隐式关闭。
   * 当前路径可以继续用于其他操作（如clip()），但一旦使用路径绘制操作（path()或rect()），将开始新路径。
   *
   * @param cap 线帽样式。可以是"round"、"square"或"butt"。
   * @param join 线连接样式。可以是"round"、"bevel"或"miter"。
   * @param thickness 线粗细（以像素为单位）。
   * @param srcLayer 用作描边内重复图案的层。
   */
  public strokeLayer(cap: CanvasLineCap, join: CanvasLineJoin, thickness: number, srcLayer: Layer): void {
    // 使用图像数据描边
    this.context.lineCap = cap;
    this.context.lineJoin = join;
    this.context.lineWidth = thickness;
    this.context.strokeStyle = this.context.createPattern(
      srcLayer.getCanvas(),
      "repeat"
    )!;
    this.context.stroke();
    this.empty = false;

    // 路径现在隐式关闭
    this.pathClosed = true;
  }

  /**
   * 用指定层中的图像填充当前路径。图像数据将在描边内无限平铺。当前路径隐式关闭。
   * 当前路径可以继续用于其他操作（如clip()），但一旦使用路径绘制操作（path()或rect()），将开始新路径。
   *
   * @param srcLayer 用作填充内重复图案的层。
   */
  public fillLayer(srcLayer: Layer): void {
    // 使用图像数据填充
    this.context.fillStyle = this.context.createPattern(
      srcLayer.getCanvas(),
      "repeat"
    )!;
    this.context.fill();
    this.empty = false;

    // 路径现在隐式关闭
    this.pathClosed = true;
  }

  /**
   * 将当前层状态推入栈。
   */
  public push(): void {
    // 将当前状态保存到栈
    this.context.save();
    this.stackSize++;
  }

  /**
   * 从栈弹出层状态。
   */
  public pop(): void {
    // 从栈恢复当前状态
    if (this.stackSize > 0) {
      this.context.restore();
      this.stackSize--;
    }
  }

  /**
   * 重置层，清除栈、当前路径和任何变换矩阵。
   */
  public reset(): void {
    // 清除栈
    while (this.stackSize > 0) {
      this.context.restore();
      this.stackSize--;
    }

    // 恢复到初始状态
    this.context.restore();
    this.context.save();

    // 清除路径
    this.context.beginPath();
    this.pathClosed = false;
  }

  /**
   * 设置给定的仿射变换（由变换矩阵的六个值定义）。
   *
   * @param a 仿射变换矩阵中的第一个值。
   * @param b 仿射变换矩阵中的第二个值。
   * @param c 仿射变换矩阵中的第三个值。
   * @param d 仿射变换矩阵中的第四个值。
   * @param e 仿射变换矩阵中的第五个值。
   * @param f 仿射变换矩阵中的第六个值。
   */
  public setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.context.setTransform(
      a, b, c,
      d, e, f
      /*0, 0, 1*/
    );
  }

  /**
   * 应用给定的仿射变换（由变换矩阵的六个值定义）。
   *
   * @param a 仿射变换矩阵中的第一个值。
   * @param b 仿射变换矩阵中的第二个值。
   * @param c 仿射变换矩阵中的第三个值。
   * @param d 仿射变换矩阵中的第四个值。
   * @param e 仿射变换矩阵中的第五个值。
   * @param f 仿射变换矩阵中的第六个值。
   */
  public transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.context.transform(
      a, b, c,
      d, e, f
      /*0, 0, 1*/
    );
  }

  /**
   * 设置此Layer上未来操作的通道掩码。
   *
   * 通道掩码是Guacamole特定的合成操作标识符，具有表示四个通道（按顺序）的单个位：
   * 目标透明的源图像，目标不透明的源，源透明的目标，以及源不透明的目标。
   *
   * @param mask 此Layer上未来操作的通道掩码。
   */
  public setChannelMask(mask: number): void {
    this.context.globalCompositeOperation = this.compositeOperation[mask];
  }

  /**
   * 设置使用斜接连接的描边操作的斜接限制。此限制是斜接连接大小与描边宽度的最大比率。
   * 如果超过此比率，则不会为此路径的该连接处绘制斜接。
   *
   * @param limit 使用斜接连接的描边操作的斜接限制。
   */
  public setMiterLimit(limit: number): void {
    this.context.miterLimit = limit;
  }
}


/**
 * 表示单个图像像素的数据。所有组件的最小值为0，最大值为255。
 */
class PixelImpl implements Pixel {
  /**
   * 像素的红色分量，范围从0到255。
   */
  public red: number;

  /**
   * 像素的绿色分量，范围从0到255。
   */
  public green: number;

  /**
   * 像素的蓝色分量，范围从0到255。
   */
  public blue: number;

  /**
   * 像素的alpha分量，范围从0到255。
   */
  public alpha: number;

  /**
   * @constructor
   *
   * @param r 像素的红色分量。
   * @param g 像素的绿色分量。
   * @param b 像素的蓝色分量。
   * @param a 像素的alpha分量。
   */
  constructor(r: number, g: number, b: number, a: number) {
    this.red = r;
    this.green = g;
    this.blue = b;
    this.alpha = a;
  }
}

export {
  PixelImpl,
  Layer
}

// 导出类供其他模块使用
export default Layer;