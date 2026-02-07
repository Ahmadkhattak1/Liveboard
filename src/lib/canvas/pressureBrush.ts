import * as fabric from 'fabric';

const MIN_PRESSURE_FACTOR = 0.45;
const MAX_PRESSURE_FACTOR = 1.75;
const SPEED_LIMIT = 2.2; // px/ms
const WIDTH_SMOOTHING = 0.22;

/**
 * Smoother real-time pressure brush:
 * - Uses native pointer pressure when available
 * - Falls back to speed-based pressure simulation
 * - Smooths width transitions while drawing (mouse down -> move)
 */
export class PressureBrush extends fabric.PencilBrush {
  public baseWidth: number;
  private pointWidths: number[] = [];
  private filteredWidth: number;
  private lastTimestamp = 0;

  constructor(canvas: fabric.Canvas) {
    super(canvas);
    this.baseWidth = this.width || 2;
    this.filteredWidth = this.baseWidth;
    this.decimate = 0; // preserve points for smoother pressure curves
  }

  private getEventTimestamp(event: fabric.TPointerEvent): number {
    return event.timeStamp && event.timeStamp > 0 ? event.timeStamp : Date.now();
  }

  private getNativePressure(event: fabric.TPointerEvent): number | null {
    if ('pressure' in event && typeof event.pressure === 'number' && event.pressure > 0) {
      return Math.min(1, Math.max(0, event.pressure));
    }

    if ('touches' in event && event.touches.length > 0) {
      const force = event.touches[0].force;
      if (typeof force === 'number' && force > 0) {
        return Math.min(1, Math.max(0, force));
      }
    }

    if ('changedTouches' in event && event.changedTouches.length > 0) {
      const force = event.changedTouches[0].force;
      if (typeof force === 'number' && force > 0) {
        return Math.min(1, Math.max(0, force));
      }
    }

    return null;
  }

  private getSpeedBasedFactor(distance: number, dtMs: number): number {
    const speed = dtMs > 0 ? distance / dtMs : SPEED_LIMIT;
    const normalizedSpeed = Math.min(speed / SPEED_LIMIT, 1);
    return MAX_PRESSURE_FACTOR - normalizedSpeed * (MAX_PRESSURE_FACTOR - MIN_PRESSURE_FACTOR);
  }

  private smoothWidth(targetWidth: number): number {
    this.filteredWidth =
      this.filteredWidth + (targetWidth - this.filteredWidth) * WIDTH_SMOOTHING;
    return this.filteredWidth;
  }

  private syncPointWidths(nextWidth: number): void {
    while (this.pointWidths.length > this._points.length) {
      this.pointWidths.pop();
    }

    while (this.pointWidths.length < this._points.length) {
      this.pointWidths.push(nextWidth);
    }
  }

  private getWidthAt(index: number): number {
    return this.pointWidths[index] ?? this.filteredWidth ?? this.baseWidth;
  }

  private calculateDynamicWidth(
    previousPoint: fabric.Point | null,
    pointer: fabric.Point,
    event: fabric.TPointerEvent
  ): number {
    const nativePressure = this.getNativePressure(event);
    const now = this.getEventTimestamp(event);
    const dt = this.lastTimestamp > 0 ? Math.max(1, now - this.lastTimestamp) : 16;
    this.lastTimestamp = now;

    let factor = 1;

    if (nativePressure !== null) {
      factor =
        MIN_PRESSURE_FACTOR +
        nativePressure * (MAX_PRESSURE_FACTOR - MIN_PRESSURE_FACTOR);
    } else if (previousPoint) {
      const dx = pointer.x - previousPoint.x;
      const dy = pointer.y - previousPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      factor = this.getSpeedBasedFactor(distance, dt);
    }

    return this.smoothWidth(this.baseWidth * factor);
  }

  onMouseDown(pointer: fabric.Point, { e }: { e: fabric.TPointerEvent }): void {
    if (!this.canvas._isMainEvent(e)) {
      return;
    }

    this._prepareForDrawing(pointer);
    this.filteredWidth = this.baseWidth;
    this.lastTimestamp = this.getEventTimestamp(e);
    this.pointWidths = new Array(this._points.length).fill(this.baseWidth);

    // Capture a duplicate point so click-without-move still draws a dot
    const pointAdded = this._addPoint(pointer);
    if (pointAdded) {
      this.syncPointWidths(this.baseWidth);
    }

    this.canvas.clearContext(this.canvas.contextTop);
    this._render();
  }

  onMouseMove(pointer: fabric.Point, { e }: { e: fabric.TPointerEvent }): void {
    if (!this.canvas._isMainEvent(e)) {
      return;
    }

    if (this.limitedToCanvasSize === true && this._isOutSideCanvas(pointer)) {
      return;
    }

    const previousPoint = this._points.length > 0 ? this._points[this._points.length - 1] : null;
    const dynamicWidth = this.calculateDynamicWidth(previousPoint, pointer, e);
    const pointAdded = this._addPoint(pointer);

    if (!pointAdded || this._points.length < 2) {
      return;
    }

    this.syncPointWidths(dynamicWidth);
    this.canvas.clearContext(this.canvas.contextTop);
    this._render();
  }

  onMouseUp({ e }: { e: fabric.TPointerEvent }): boolean {
    if (!this.canvas._isMainEvent(e)) {
      return true;
    }

    this._finalizeAndAddPath();
    return false;
  }

  _render(ctx: CanvasRenderingContext2D = this.canvas.contextTop): void {
    if (!this._points || this._points.length === 0) {
      return;
    }

    this._saveAndTransform(ctx);
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineCap = this.strokeLineCap;
    ctx.lineJoin = this.strokeLineJoin;
    ctx.miterLimit = this.strokeMiterLimit;
    ctx.setLineDash(this.strokeDashArray || []);

    if (this._points.length === 1) {
      const point = this._points[0];
      const radius = this.getWidthAt(0) / 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    for (let i = 1; i < this._points.length; i++) {
      const p1 = this._points[i - 1];
      const p2 = this._points[i];
      const w1 = this.getWidthAt(i - 1);
      const w2 = this.getWidthAt(i);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(distance / 2));
      let prevX = p1.x;
      let prevY = p1.y;

      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const x = p1.x + dx * t;
        const y = p1.y + dy * t;
        const width = w1 + (w2 - w1) * t;

        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();

        prevX = x;
        prevY = y;
      }
    }

    ctx.restore();
  }

  _finalizeAndAddPath(): void {
    const ctx = this.canvas.contextTop;
    ctx.closePath();

    if (!this._points || this._points.length === 0) {
      this.canvas.requestRenderAll();
      return;
    }

    const segments: Array<fabric.Line | fabric.Circle> = [];

    if (this._points.length === 1) {
      const point = this._points[0];
      const radius = this.getWidthAt(0) / 2;
      segments.push(
        new fabric.Circle({
          left: point.x - radius,
          top: point.y - radius,
          radius,
          fill: this.color,
          stroke: undefined,
          selectable: false,
          evented: false,
        })
      );
    } else {
      for (let i = 1; i < this._points.length; i++) {
        const p1 = this._points[i - 1];
        const p2 = this._points[i];

        if (p1.eq(p2)) {
          continue;
        }

        const width = (this.getWidthAt(i - 1) + this.getWidthAt(i)) / 2;

        segments.push(
          new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
            stroke: this.color,
            strokeWidth: width,
            strokeLineCap: this.strokeLineCap,
            strokeLineJoin: this.strokeLineJoin,
            strokeMiterLimit: this.strokeMiterLimit,
            strokeDashArray: this.strokeDashArray,
            fill: undefined,
            strokeUniform: true,
            selectable: false,
            evented: false,
          })
        );
      }
    }

    if (segments.length === 0) {
      this.canvas.requestRenderAll();
      return;
    }

    const strokeObject: fabric.FabricObject =
      segments.length === 1
        ? segments[0]
        : new fabric.Group(segments, {
            subTargetCheck: false,
            objectCaching: true,
          });

    strokeObject.set({
      selectable: true,
      evented: true,
    });

    if (this.shadow) {
      strokeObject.set('shadow', new fabric.Shadow(this.shadow));
    }

    this.canvas.clearContext(this.canvas.contextTop);
    this.canvas.fire('before:path:created', { path: strokeObject });
    this.canvas.add(strokeObject);
    this.canvas.requestRenderAll();
    strokeObject.setCoords();
    this._resetShadow();
    this.canvas.fire('path:created', { path: strokeObject });
  }

  set widthValue(width: number) {
    this.baseWidth = width;
    this.width = width;
    this.filteredWidth = width;
  }
}
