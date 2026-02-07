import * as fabric from 'fabric';
import { CANVAS_CONFIG } from '@/lib/constants/config';
import { generateObjectId } from '@/lib/utils/generateId';

export interface CanvasOptions {
  width: number;
  height: number;
  backgroundColor?: string;
  selection?: boolean;
}

export function initializeFabricCanvas(
  canvasElement: HTMLCanvasElement,
  options: Partial<CanvasOptions> = {}
): fabric.Canvas {
  const canvas = new fabric.Canvas(canvasElement, {
    width: options.width || CANVAS_CONFIG.defaultWidth,
    height: options.height || CANVAS_CONFIG.defaultHeight,
    backgroundColor: options.backgroundColor || '#ffffff',
    selection: options.selection !== false,
    preserveObjectStacking: true,
    renderOnAddRemove: true,
    enableRetinaScaling: true,
  });

  // Set default properties for new objects (Miro-style)
  fabric.Object.prototype.set({
    borderColor: '#4A90E2',
    cornerColor: '#4A90E2',
    cornerStyle: 'circle',
    transparentCorners: false,
    cornerSize: 10,
    borderScaleFactor: 1.5,
    padding: 8,
    // Add subtle shadow for depth
    shadow: new fabric.Shadow({
      color: 'rgba(0, 0, 0, 0.15)',
      blur: 8,
      offsetX: 0,
      offsetY: 2,
    }),
  });

  return canvas;
}

export function addObjectId(obj: fabric.Object, userId: string): void {
  (obj as any).id = generateObjectId();
  (obj as any).createdBy = userId;
  (obj as any).createdAt = Date.now();
  (obj as any).updatedAt = Date.now();
  (obj as any).updatedBy = userId;
}

export function resizeCanvas(canvas: fabric.Canvas, width: number, height: number): void {
  canvas.setWidth(width);
  canvas.setHeight(height);
  canvas.renderAll();
}

export function clearCanvas(canvas: fabric.Canvas): void {
  canvas.clear();
  canvas.backgroundColor = '#ffffff';
  canvas.renderAll();
}

export function exportCanvasToJSON(canvas: fabric.Canvas): string {
  return JSON.stringify(canvas.toJSON());
}

export async function loadCanvasFromJSON(canvas: fabric.Canvas, json: string): Promise<void> {
  try {
    await canvas.loadFromJSON(json);
    canvas.renderAll();
  } catch (error) {
    throw new Error('Failed to load canvas from JSON');
  }
}

export function getCanvasCenter(canvas: fabric.Canvas): { x: number; y: number } {
  return {
    x: canvas.getWidth() / 2,
    y: canvas.getHeight() / 2,
  };
}

export function setCanvasZoom(canvas: fabric.Canvas, zoom: number): void {
  const center = getCanvasCenter(canvas);
  canvas.zoomToPoint(new fabric.Point(center.x, center.y), zoom);
}

export function resetCanvasView(canvas: fabric.Canvas): void {
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.renderAll();
}
