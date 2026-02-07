import * as fabric from 'fabric';
import { CANVAS_CONFIG } from '@/lib/constants/config';
import { generateObjectId } from '@/lib/utils/generateId';
import { installConnectorCanvasHooks } from './connectors';

export interface CanvasOptions {
  width: number;
  height: number;
  backgroundColor?: string;
  selection?: boolean;
}

const SELECTION_COLOR = '#4263FF';
const CORNER_HANDLE_FILL = '#FFFFFF';
const CORNER_HANDLE_STROKE = '#AEB9CD';
const EDGE_HANDLE_FILL = '#4263FF';
const EDGE_HANDLE_STROKE = '#FFFFFF';
const ROTATE_HANDLE_FILL = '#FFFFFF';
const ROTATE_HANDLE_STROKE = '#D5DEEB';
const ROTATE_ICON_COLOR = '#0F172A';
const CORNER_HANDLE_RADIUS = 5.7;
const EDGE_HANDLE_RADIUS = 4.6;
const ROTATE_HANDLE_RADIUS = 11.5;
const FALLBACK_CANVAS_WIDTH = 1280;
const FALLBACK_CANVAS_HEIGHT = 720;
const FALLBACK_MAX_CANVAS_WIDTH = 1800;
const FALLBACK_MAX_CANVAS_HEIGHT = 1000;

function toPositiveDimension(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

function getCanvasDimensions(width: number, height: number): { width: number; height: number } {
  const defaultWidth = toPositiveDimension(CANVAS_CONFIG.defaultWidth, FALLBACK_CANVAS_WIDTH);
  const defaultHeight = toPositiveDimension(CANVAS_CONFIG.defaultHeight, FALLBACK_CANVAS_HEIGHT);
  const maxWidth = Math.max(
    toPositiveDimension(CANVAS_CONFIG.maxWidth, FALLBACK_MAX_CANVAS_WIDTH),
    320
  );
  const maxHeight = Math.max(
    toPositiveDimension(CANVAS_CONFIG.maxHeight, FALLBACK_MAX_CANVAS_HEIGHT),
    240
  );

  return {
    width: Math.min(toPositiveDimension(width, defaultWidth), maxWidth),
    height: Math.min(toPositiveDimension(height, defaultHeight), maxHeight),
  };
}

function renderCircularHandle(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  radius: number,
  fill: string,
  stroke: string,
  strokeWidth: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(left, top, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function renderCornerHandle(ctx: CanvasRenderingContext2D, left: number, top: number): void {
  renderCircularHandle(
    ctx,
    left,
    top,
    CORNER_HANDLE_RADIUS,
    CORNER_HANDLE_FILL,
    CORNER_HANDLE_STROKE,
    1.7
  );
}

function renderEdgeHandle(ctx: CanvasRenderingContext2D, left: number, top: number): void {
  renderCircularHandle(
    ctx,
    left,
    top,
    EDGE_HANDLE_RADIUS,
    EDGE_HANDLE_FILL,
    EDGE_HANDLE_STROKE,
    1.8
  );
}

function renderRotateHandle(ctx: CanvasRenderingContext2D, left: number, top: number): void {
  renderCircularHandle(
    ctx,
    left,
    top,
    ROTATE_HANDLE_RADIUS,
    ROTATE_HANDLE_FILL,
    ROTATE_HANDLE_STROKE,
    1.6
  );

  const arcRadius = 4.8;
  const startAngle = 0.35 * Math.PI;
  const endAngle = 1.78 * Math.PI;
  const tipX = left + Math.cos(startAngle) * arcRadius;
  const tipY = top + Math.sin(startAngle) * arcRadius;
  const tangentAngle = startAngle - Math.PI / 2;
  const arrowSize = 3.8;

  ctx.save();
  ctx.beginPath();
  ctx.arc(left, top, arcRadius, startAngle, endAngle, true);
  ctx.strokeStyle = ROTATE_ICON_COLOR;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - Math.cos(tangentAngle - 0.45) * arrowSize,
    tipY - Math.sin(tangentAngle - 0.45) * arrowSize
  );
  ctx.lineTo(
    tipX - Math.cos(tangentAngle + 0.45) * arrowSize,
    tipY - Math.sin(tangentAngle + 0.45) * arrowSize
  );
  ctx.closePath();
  ctx.fillStyle = ROTATE_ICON_COLOR;
  ctx.fill();
  ctx.restore();
}

function styleControlSet(controls: Record<string, fabric.Control> | undefined): void {
  if (!controls) return;

  const cornerKeys = ['tl', 'tr', 'bl', 'br'] as const;
  const edgeKeys = ['ml', 'mr', 'mt', 'mb'] as const;

  cornerKeys.forEach((key) => {
    const control = controls[key];
    if (!control) return;

    control.sizeX = 14;
    control.sizeY = 14;
    control.touchSizeX = 30;
    control.touchSizeY = 30;
    control.render = renderCornerHandle;
  });

  edgeKeys.forEach((key) => {
    const control = controls[key];
    if (!control) return;

    control.sizeX = 12;
    control.sizeY = 12;
    control.touchSizeX = 28;
    control.touchSizeY = 28;
    control.render = renderEdgeHandle;
  });

  const rotateControl = controls.mtr;
  if (!rotateControl) return;

  rotateControl.x = 0;
  rotateControl.y = 0.5;
  rotateControl.offsetY = 34;
  rotateControl.withConnection = false;
  rotateControl.cursorStyle = 'grab';
  rotateControl.sizeX = 24;
  rotateControl.sizeY = 24;
  rotateControl.touchSizeX = 34;
  rotateControl.touchSizeY = 34;
  rotateControl.render = renderRotateHandle;
}

function installMiroLikeControls(): void {
  styleControlSet(fabric.Object.prototype.controls as Record<string, fabric.Control> | undefined);
  styleControlSet(
    fabric.Textbox?.prototype.controls as Record<string, fabric.Control> | undefined
  );
}

export function initializeFabricCanvas(
  canvasElement: HTMLCanvasElement,
  options: Partial<CanvasOptions> = {}
): fabric.Canvas {
  const dimensions = getCanvasDimensions(
    options.width ?? CANVAS_CONFIG.defaultWidth,
    options.height ?? CANVAS_CONFIG.defaultHeight
  );

  const canvas = new fabric.Canvas(canvasElement, {
    width: dimensions.width,
    height: dimensions.height,
    backgroundColor: options.backgroundColor || 'transparent',
    selection: options.selection !== false,
    preserveObjectStacking: true,
    renderOnAddRemove: true,
    enableRetinaScaling: true,
  });

  installMiroLikeControls();

  // Default selection styling for non-connector objects.
  fabric.Object.prototype.set({
    borderColor: SELECTION_COLOR,
    cornerColor: CORNER_HANDLE_FILL,
    cornerStrokeColor: CORNER_HANDLE_STROKE,
    cornerStyle: 'circle',
    transparentCorners: false,
    cornerSize: 14,
    touchCornerSize: 30,
    borderScaleFactor: 1,
    padding: 2,
    // Add subtle shadow for depth.
    shadow: new fabric.Shadow({
      color: 'rgba(0, 0, 0, 0.15)',
      blur: 8,
      offsetX: 0,
      offsetY: 2,
    }),
  });

  installConnectorCanvasHooks(canvas);

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
  const dimensions = getCanvasDimensions(width, height);
  canvas.setWidth(dimensions.width);
  canvas.setHeight(dimensions.height);
  canvas.renderAll();
}

export function clearCanvas(canvas: fabric.Canvas): void {
  canvas.clear();
  canvas.backgroundColor = 'transparent';
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
