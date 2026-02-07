import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';

export class DrawingTool {
  private canvas: fabric.Canvas;
  private isDrawing: boolean = false;
  private currentPath: fabric.Path | null = null;
  private userId: string;
  private strokeColor: string;
  private strokeWidth: number;

  constructor(
    canvas: fabric.Canvas,
    userId: string,
    strokeColor: string = '#000000',
    strokeWidth: number = 2
  ) {
    this.canvas = canvas;
    this.userId = userId;
    this.strokeColor = strokeColor;
    this.strokeWidth = strokeWidth;
  }

  enable(): void {
    this.canvas.isDrawingMode = true;

    // Create a new PencilBrush for smoother drawing
    const brush = new fabric.PencilBrush(this.canvas);
    brush.color = this.strokeColor;
    brush.width = this.strokeWidth;
    brush.strokeLineCap = 'round';
    brush.strokeLineJoin = 'round';

    this.canvas.freeDrawingBrush = brush;
    this.canvas.on('path:created', this.onPathCreated);
  }

  disable(): void {
    this.canvas.isDrawingMode = false;
    this.canvas.off('path:created', this.onPathCreated);
  }

  private onPathCreated = (event: any): void => {
    const path = event.path;
    addObjectId(path, this.userId);
  };

  updateColor(color: string): void {
    this.strokeColor = color;
    if (this.canvas.isDrawingMode && this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = color;
    }
  }

  updateWidth(width: number): void {
    this.strokeWidth = width;
    if (this.canvas.isDrawingMode && this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.width = width;
    }
  }
}

export function enableDrawingMode(
  canvas: fabric.Canvas,
  color: string = '#000000',
  width: number = 2
): void {
  canvas.isDrawingMode = true;

  // Create a new PencilBrush for smoother drawing
  const brush = new fabric.PencilBrush(canvas);
  brush.color = color;
  brush.width = width;

  // Improve drawing smoothness
  brush.strokeLineCap = 'round';
  brush.strokeLineJoin = 'round';

  canvas.freeDrawingBrush = brush;
}

export function disableDrawingMode(canvas: fabric.Canvas): void {
  canvas.isDrawingMode = false;
}
