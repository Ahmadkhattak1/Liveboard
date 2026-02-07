import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';

export function addRectangle(
  canvas: fabric.Canvas,
  userId: string,
  options: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  } = {}
): fabric.Rect {
  const rect = new fabric.Rect({
    left: options.left || 100,
    top: options.top || 100,
    width: options.width || 150,
    height: options.height || 100,
    fill: options.fill || 'transparent',
    stroke: options.stroke || '#000000',
    strokeWidth: options.strokeWidth || 2,
    rx: 8, // Rounded corners (Miro-style)
    ry: 8,
  });

  addObjectId(rect, userId);
  canvas.add(rect);
  canvas.setActiveObject(rect);
  canvas.renderAll();

  return rect;
}

export function addCircle(
  canvas: fabric.Canvas,
  userId: string,
  options: {
    left?: number;
    top?: number;
    radius?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  } = {}
): fabric.Circle {
  const circle = new fabric.Circle({
    left: options.left || 100,
    top: options.top || 100,
    radius: options.radius || 50,
    fill: options.fill || 'transparent',
    stroke: options.stroke || '#000000',
    strokeWidth: options.strokeWidth || 2,
  });

  addObjectId(circle, userId);
  canvas.add(circle);
  canvas.setActiveObject(circle);
  canvas.renderAll();

  return circle;
}

export function addLine(
  canvas: fabric.Canvas,
  userId: string,
  options: {
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    stroke?: string;
    strokeWidth?: number;
  } = {}
): fabric.Line {
  const line = new fabric.Line(
    [
      options.x1 || 100,
      options.y1 || 100,
      options.x2 || 300,
      options.y2 || 100,
    ],
    {
      stroke: options.stroke || '#000000',
      strokeWidth: options.strokeWidth || 2,
    }
  );

  addObjectId(line, userId);
  canvas.add(line);
  canvas.setActiveObject(line);
  canvas.renderAll();

  return line;
}
