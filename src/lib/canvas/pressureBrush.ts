import * as fabric from 'fabric';

const MIN_PRESSURE_FACTOR = 0.45;
const MAX_PRESSURE_FACTOR = 1.75;
const SPEED_LIMIT = 2.2; // px/ms
const WIDTH_SMOOTHING = 0.22;
const CURVE_SEGMENT_LENGTH = 1.9;
const MIN_SAMPLE_DISTANCE_SQ = 0.05;

/**
 * Smoother real-time pressure brush:
 * - Uses native pointer pressure when available
 * - Falls back to speed-based pressure simulation
 * - Smooths width transitions while drawing (mouse down -> move)
 */
interface StrokeSample {
  point: fabric.Point;
  width: number;
}

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

  private clampWidth(width: number): number {
    const minWidth = Math.max(0.2, this.baseWidth * MIN_PRESSURE_FACTOR * 0.7);
    const maxWidth = Math.max(this.baseWidth, this.baseWidth * MAX_PRESSURE_FACTOR * 1.35);
    return Math.min(maxWidth, Math.max(minWidth, width));
  }

  private compactSamples(samples: StrokeSample[]): StrokeSample[] {
    if (samples.length <= 1) {
      return samples;
    }

    const compacted: StrokeSample[] = [samples[0]];

    for (let i = 1; i < samples.length; i++) {
      const previous = compacted[compacted.length - 1];
      const current = samples[i];
      const dx = current.point.x - previous.point.x;
      const dy = current.point.y - previous.point.y;
      if (dx * dx + dy * dy < MIN_SAMPLE_DISTANCE_SQ) {
        previous.width = (previous.width + current.width) * 0.5;
        continue;
      }
      compacted.push(current);
    }

    const tail = samples[samples.length - 1];
    const compactedTail = compacted[compacted.length - 1];
    if (!compactedTail.point.eq(tail.point)) {
      compacted.push(tail);
    } else {
      compactedTail.width = tail.width;
    }

    return compacted;
  }

  private pushLinearSamples(
    samples: StrokeSample[],
    start: StrokeSample,
    end: StrokeSample
  ): void {
    const distance = start.point.distanceFrom(end.point);
    const steps = Math.max(1, Math.ceil(distance / CURVE_SEGMENT_LENGTH));

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const x = start.point.x + (end.point.x - start.point.x) * t;
      const y = start.point.y + (end.point.y - start.point.y) * t;
      const width = this.clampWidth(start.width + (end.width - start.width) * t);
      samples.push({
        point: new fabric.Point(x, y),
        width,
      });
    }
  }

  private pushQuadraticSamples(
    samples: StrokeSample[],
    start: StrokeSample,
    control: StrokeSample,
    end: StrokeSample
  ): void {
    const approxLength =
      start.point.distanceFrom(control.point) + control.point.distanceFrom(end.point);
    const steps = Math.max(1, Math.ceil(approxLength / CURVE_SEGMENT_LENGTH));

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const invT = 1 - t;
      const x =
        invT * invT * start.point.x +
        2 * invT * t * control.point.x +
        t * t * end.point.x;
      const y =
        invT * invT * start.point.y +
        2 * invT * t * control.point.y +
        t * t * end.point.y;
      const width = this.clampWidth(start.width + (end.width - start.width) * t);
      samples.push({
        point: new fabric.Point(x, y),
        width,
      });
    }
  }

  private buildInterpolatedSamples(): StrokeSample[] {
    if (!this._points || this._points.length === 0) {
      return [];
    }

    const rawSamples: StrokeSample[] = this._points.map((point, index) => ({
      point,
      width: this.clampWidth(this.getWidthAt(index)),
    }));

    if (rawSamples.length < 3) {
      return this.compactSamples(rawSamples);
    }

    const interpolated: StrokeSample[] = [rawSamples[0]];
    let segmentStart: StrokeSample = rawSamples[0];

    for (let i = 1; i < rawSamples.length; i++) {
      const control = rawSamples[i - 1];
      const target = rawSamples[i];
      const midpoint = control.point.midPointFrom(target.point);
      const midpointSample: StrokeSample = {
        point: midpoint,
        width: this.clampWidth((control.width + target.width) * 0.5),
      };

      this.pushQuadraticSamples(interpolated, segmentStart, control, midpointSample);
      segmentStart = midpointSample;
    }

    this.pushLinearSamples(interpolated, segmentStart, rawSamples[rawSamples.length - 1]);
    return this.compactSamples(interpolated);
  }

  private renderDot(ctx: CanvasRenderingContext2D, sample: StrokeSample): void {
    const radius = sample.width / 2;
    ctx.beginPath();
    ctx.arc(sample.point.x, sample.point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderSamples(ctx: CanvasRenderingContext2D, samples: StrokeSample[]): void {
    if (samples.length === 1) {
      this.renderDot(ctx, samples[0]);
      return;
    }

    for (let i = 1; i < samples.length; i++) {
      const start = samples[i - 1];
      const end = samples[i];
      if (start.point.eq(end.point)) {
        continue;
      }

      ctx.lineWidth = (start.width + end.width) * 0.5;
      ctx.beginPath();
      ctx.moveTo(start.point.x, start.point.y);
      ctx.lineTo(end.point.x, end.point.y);
      ctx.stroke();
    }

    // Ensure rounded stroke ends are always fully opaque.
    this.renderDot(ctx, samples[0]);
    this.renderDot(ctx, samples[samples.length - 1]);
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

    const samples = this.buildInterpolatedSamples();
    if (samples.length === 0) {
      return;
    }

    this._saveAndTransform(ctx);
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineCap = this.strokeLineCap;
    ctx.lineJoin = this.strokeLineJoin;
    ctx.miterLimit = this.strokeMiterLimit;
    ctx.setLineDash(this.strokeDashArray || []);
    this.renderSamples(ctx, samples);
    ctx.restore();
  }

  _finalizeAndAddPath(): void {
    const ctx = this.canvas.contextTop;
    ctx.closePath();

    if (!this._points || this._points.length === 0) {
      this.canvas.requestRenderAll();
      return;
    }

    const samples = this.buildInterpolatedSamples();
    if (samples.length === 0) {
      this.canvas.requestRenderAll();
      return;
    }

    const segments: Array<fabric.Line | fabric.Circle> = [];

    if (samples.length === 1) {
      const sample = samples[0];
      const radius = sample.width / 2;
      segments.push(
        new fabric.Circle({
          left: sample.point.x - radius,
          top: sample.point.y - radius,
          radius,
          fill: this.color,
          stroke: undefined,
          selectable: false,
          evented: false,
        })
      );
    } else {
      for (let i = 1; i < samples.length; i++) {
        const start = samples[i - 1];
        const end = samples[i];

        if (start.point.eq(end.point)) {
          continue;
        }

        const width = (start.width + end.width) * 0.5;

        segments.push(
          new fabric.Line([start.point.x, start.point.y, end.point.x, end.point.y], {
            stroke: this.color,
            strokeWidth: width,
            strokeLineCap: this.strokeLineCap,
            strokeLineJoin: this.strokeLineJoin,
            strokeMiterLimit: this.strokeMiterLimit,
            strokeDashArray: this.strokeDashArray,
            fill: 'transparent',
            strokeUniform: true,
            selectable: false,
            evented: false,
          })
        );
      }

      if (segments.length === 0) {
        const sample = samples[samples.length - 1];
        const radius = sample.width / 2;
        segments.push(
          new fabric.Circle({
            left: sample.point.x - radius,
            top: sample.point.y - radius,
            radius,
            fill: this.color,
            stroke: undefined,
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
