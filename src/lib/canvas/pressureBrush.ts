import * as fabric from 'fabric';

/**
 * Custom brush with simulated pen pressure based on drawing speed
 * Slower drawing = thicker strokes (like pressing harder)
 * Faster drawing = thinner strokes (like light touch)
 */
export class PressureBrush extends fabric.PencilBrush {
  private lastPoint: { x: number; y: number } | null = null;
  private lastTime: number = 0;
  public baseWidth: number;

  constructor(canvas: fabric.Canvas) {
    super(canvas);
    this.baseWidth = this.width || 2;
  }

  _render(): void {
    if (!this._points || this._points.length < 2) {
      return;
    }

    const ctx = this.canvas.contextTop;
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineCap = this.strokeLineCap;
    ctx.lineJoin = this.strokeLineJoin;

    // Draw with variable width based on speed
    for (let i = 1; i < this._points.length; i++) {
      const p1 = this._points[i - 1];
      const p2 = this._points[i];

      // Calculate distance between points
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Simulate pressure based on distance (spacing between points)
      // Closer points = slower drawing = more pressure = thicker line
      const maxDistance = 10;
      const normalizedDistance = Math.min(distance / maxDistance, 1);
      const pressure = 1.5 - normalizedDistance * 1.0; // Range: 0.5 to 1.5

      const width = this.baseWidth * pressure;

      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Custom setter for width
  set widthValue(width: number) {
    this.baseWidth = width;
    this.width = width;
  }
}
