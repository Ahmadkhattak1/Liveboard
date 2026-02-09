import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';
import { createConnectorShape, setConnectorStraightGeometry } from './connectors';

export type ShapeToolType =
  | 'line'
  | 'arrow'
  | 'elbowArrow'
  | 'curvedArrow'
  | 'rectangle'
  | 'roundedRectangle'
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'star'
  | 'hexagon'
  | 'parallelogram'
  | 'blockArrow';

export const SHAPE_TOOL_IDS: ShapeToolType[] = [
  'line',
  'arrow',
  'elbowArrow',
  'curvedArrow',
  'rectangle',
  'roundedRectangle',
  'circle',
  'diamond',
  'triangle',
  'star',
  'hexagon',
  'parallelogram',
  'blockArrow',
];

export const CONNECTOR_SHAPE_TOOL_IDS: ShapeToolType[] = [
  'line',
  'arrow',
  'elbowArrow',
  'curvedArrow',
];

export const DRAFT_SHAPE_FLAG = 'liveboardDraftShape';

export function isShapeToolType(value: string): value is ShapeToolType {
  return SHAPE_TOOL_IDS.includes(value as ShapeToolType);
}

export function isConnectorShapeTool(tool: ShapeToolType): boolean {
  return CONNECTOR_SHAPE_TOOL_IDS.includes(tool);
}

export interface ShapePoint {
  x: number;
  y: number;
}

export interface ShapeStyleOptions {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export type DrawableShape =
  | fabric.Rect
  | fabric.Ellipse
  | fabric.Line
  | fabric.Triangle
  | fabric.Polygon
  | fabric.Polyline;

const SHAPE_CLICK_THRESHOLD = 4;
const DEFAULT_RECTANGLE_WIDTH = 150;
const DEFAULT_RECTANGLE_HEIGHT = 100;
const DEFAULT_ROUNDED_RECTANGLE_WIDTH = 160;
const DEFAULT_ROUNDED_RECTANGLE_HEIGHT = 100;
const DEFAULT_CIRCLE_DIAMETER = 100;
const DEFAULT_LINE_LENGTH = 200;
const DEFAULT_DIAMOND_WIDTH = 140;
const DEFAULT_DIAMOND_HEIGHT = 110;
const DEFAULT_TRIANGLE_WIDTH = 140;
const DEFAULT_TRIANGLE_HEIGHT = 110;
const DEFAULT_STAR_SIZE = 140;
const DEFAULT_HEXAGON_WIDTH = 150;
const DEFAULT_HEXAGON_HEIGHT = 110;
const DEFAULT_PARALLELOGRAM_WIDTH = 150;
const DEFAULT_PARALLELOGRAM_HEIGHT = 100;
const DEFAULT_BLOCK_ARROW_WIDTH = 170;
const DEFAULT_BLOCK_ARROW_HEIGHT = 100;
const ROUNDED_RECT_CORNER_RADIUS = 14;
const ARROW_HEAD_SIZE = 14;
const CURVE_SEGMENTS = 16;

interface ShapeBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ShapeDragOptions {
  perfect?: boolean;
}

function getShapeBounds(start: ShapePoint, current: ShapePoint): ShapeBounds {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    width: Math.max(1, Math.abs(current.x - start.x)),
    height: Math.max(1, Math.abs(current.y - start.y)),
  };
}

function snapPointToAngle(start: ShapePoint, current: ShapePoint, stepRadians = Math.PI / 4): ShapePoint {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= 0.0001) {
    return current;
  }

  const angle = Math.atan2(deltaY, deltaX);
  const snappedAngle = Math.round(angle / stepRadians) * stepRadians;

  return {
    x: start.x + Math.cos(snappedAngle) * distance,
    y: start.y + Math.sin(snappedAngle) * distance,
  };
}

function constrainPointToAspectRatio(
  start: ShapePoint,
  current: ShapePoint,
  ratio: number
): ShapePoint {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX <= 0.0001 && absY <= 0.0001) {
    return current;
  }

  const signX = deltaX === 0 ? 1 : Math.sign(deltaX);
  const signY = deltaY === 0 ? 1 : Math.sign(deltaY);

  let width = absX;
  let height = absY;

  if (absY <= 0.0001 || absX / Math.max(absY, 0.0001) > safeRatio) {
    width = absX;
    height = width / safeRatio;
  } else {
    height = absY;
    width = height * safeRatio;
  }

  return {
    x: start.x + signX * width,
    y: start.y + signY * height,
  };
}

function getPerfectShapeRatio(shapeTool: ShapeToolType): number | null {
  switch (shapeTool) {
    case 'rectangle':
    case 'roundedRectangle':
    case 'circle':
      return 1;
    case 'diamond':
      return DEFAULT_DIAMOND_WIDTH / DEFAULT_DIAMOND_HEIGHT;
    case 'triangle':
      return DEFAULT_TRIANGLE_WIDTH / DEFAULT_TRIANGLE_HEIGHT;
    case 'star':
      return 1;
    case 'hexagon':
      return DEFAULT_HEXAGON_WIDTH / DEFAULT_HEXAGON_HEIGHT;
    case 'parallelogram':
      return DEFAULT_PARALLELOGRAM_WIDTH / DEFAULT_PARALLELOGRAM_HEIGHT;
    case 'blockArrow':
      return DEFAULT_BLOCK_ARROW_WIDTH / DEFAULT_BLOCK_ARROW_HEIGHT;
    default:
      return null;
  }
}

function getDragPoint(
  shapeTool: ShapeToolType,
  start: ShapePoint,
  current: ShapePoint,
  options: ShapeDragOptions
): ShapePoint {
  if (!options.perfect) {
    return current;
  }

  if (isConnectorShapeTool(shapeTool)) {
    return snapPointToAngle(start, current);
  }

  const ratio = getPerfectShapeRatio(shapeTool);
  if (ratio === null) {
    return current;
  }

  return constrainPointToAspectRatio(start, current, ratio);
}

function getArrowHeadPoints(from: ShapePoint, to: ShapePoint, size: number): [ShapePoint, ShapePoint] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const safeDistance = distance > 0.0001 ? distance : 1;
  const ux = dx / safeDistance;
  const uy = dy / safeDistance;

  const spread = Math.PI / 7;
  const angle = Math.atan2(uy, ux);

  return [
    {
      x: to.x - size * Math.cos(angle - spread),
      y: to.y - size * Math.sin(angle - spread),
    },
    {
      x: to.x - size * Math.cos(angle + spread),
      y: to.y - size * Math.sin(angle + spread),
    },
  ];
}

function buildElbowArrowPolylinePoints(start: ShapePoint, end: ShapePoint): ShapePoint[] {
  const midX = start.x + (end.x - start.x) * 0.55;
  const bendA: ShapePoint = { x: midX, y: start.y };
  const bendB: ShapePoint = { x: midX, y: end.y };
  const [headA, headB] = getArrowHeadPoints(bendB, end, ARROW_HEAD_SIZE);

  return [start, bendA, bendB, end, headA, end, headB];
}

function buildCurvedArrowPolylinePoints(start: ShapePoint, end: ShapePoint): ShapePoint[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curveAmount = Math.min(120, Math.max(36, distance * 0.25));
  const control: ShapePoint = {
    x: (start.x + end.x) / 2 + normalX * curveAmount,
    y: (start.y + end.y) / 2 + normalY * curveAmount,
  };

  const points: ShapePoint[] = [];

  for (let step = 0; step <= CURVE_SEGMENTS; step += 1) {
    const t = step / CURVE_SEGMENTS;
    const oneMinusT = 1 - t;
    points.push({
      x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x,
      y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y,
    });
  }

  const endIndex = points.length - 1;
  const arrowBase = points[Math.max(0, endIndex - 1)] ?? start;
  const [headA, headB] = getArrowHeadPoints(arrowBase, end, ARROW_HEAD_SIZE);

  return [...points, headA, end, headB];
}

function getDiamondPoints(width: number, height: number): ShapePoint[] {
  return [
    { x: width / 2, y: 0 },
    { x: width, y: height / 2 },
    { x: width / 2, y: height },
    { x: 0, y: height / 2 },
  ];
}

function getStarPoints(width: number, height: number): ShapePoint[] {
  const points: ShapePoint[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadiusX = width / 2;
  const outerRadiusY = height / 2;
  const innerRadiusX = outerRadiusX * 0.45;
  const innerRadiusY = outerRadiusY * 0.45;

  for (let index = 0; index < 10; index += 1) {
    const isOuter = index % 2 === 0;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push({
      x: centerX + Math.cos(angle) * (isOuter ? outerRadiusX : innerRadiusX),
      y: centerY + Math.sin(angle) * (isOuter ? outerRadiusY : innerRadiusY),
    });
  }

  return points;
}

function getHexagonPoints(width: number, height: number): ShapePoint[] {
  return [
    { x: width * 0.25, y: 0 },
    { x: width * 0.75, y: 0 },
    { x: width, y: height / 2 },
    { x: width * 0.75, y: height },
    { x: width * 0.25, y: height },
    { x: 0, y: height / 2 },
  ];
}

function getParallelogramPoints(width: number, height: number): ShapePoint[] {
  const slant = Math.max(12, Math.min(width * 0.3, width - 8));
  return [
    { x: slant, y: 0 },
    { x: width, y: 0 },
    { x: width - slant, y: height },
    { x: 0, y: height },
  ];
}

function getBlockArrowPoints(width: number, height: number): ShapePoint[] {
  const headWidth = Math.max(24, width * 0.36);
  const bodyTop = height * 0.26;
  const bodyBottom = height * 0.74;
  return [
    { x: 0, y: bodyTop },
    { x: width - headWidth, y: bodyTop },
    { x: width - headWidth, y: 0 },
    { x: width, y: height / 2 },
    { x: width - headWidth, y: height },
    { x: width - headWidth, y: bodyBottom },
    { x: 0, y: bodyBottom },
  ];
}

function refreshPointBasedShape(
  shape: DrawableShape,
  shapeTool: ShapeToolType
): void {
  if (
    shapeTool === 'line' ||
    shapeTool === 'arrow' ||
    shapeTool === 'elbowArrow' ||
    shapeTool === 'curvedArrow'
  ) {
    const connector = shape as fabric.Polyline;
    connector.setBoundingBox(true);
    connector.set('dirty', true);
    return;
  }

  if (
    shapeTool === 'diamond' ||
    shapeTool === 'star' ||
    shapeTool === 'hexagon' ||
    shapeTool === 'parallelogram' ||
    shapeTool === 'blockArrow'
  ) {
    const polygon = shape as fabric.Polygon;
    polygon.setDimensions();
    polygon.set('dirty', true);
  }
}

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
    left: options.left ?? 100,
    top: options.top ?? 100,
    width: options.width ?? DEFAULT_RECTANGLE_WIDTH,
    height: options.height ?? DEFAULT_RECTANGLE_HEIGHT,
    fill: options.fill ?? 'transparent',
    stroke: options.stroke ?? '#000000',
    strokeWidth: options.strokeWidth ?? 2,
    strokeUniform: true,
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
    left: options.left ?? 100,
    top: options.top ?? 100,
    radius: options.radius ?? DEFAULT_CIRCLE_DIAMETER / 2,
    fill: options.fill ?? 'transparent',
    stroke: options.stroke ?? '#000000',
    strokeWidth: options.strokeWidth ?? 2,
    strokeUniform: true,
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
): fabric.Polyline {
  const line = createConnectorShape(
    'line',
    {
      x: options.x1 ?? 100,
      y: options.y1 ?? 100,
    },
    {
      x: options.x2 ?? 100 + DEFAULT_LINE_LENGTH,
      y: options.y2 ?? 100,
    },
    {
      stroke: options.stroke ?? '#000000',
      strokeWidth: options.strokeWidth ?? 2,
    }
  );

  addObjectId(line, userId);
  canvas.add(line);
  canvas.setActiveObject(line);
  canvas.renderAll();

  return line;
}

export function createShapeForDrag(
  canvas: fabric.Canvas,
  userId: string,
  shapeTool: ShapeToolType,
  start: ShapePoint,
  options: ShapeStyleOptions = {}
): DrawableShape {
  const stroke = options.stroke ?? '#000000';
  const strokeWidth = options.strokeWidth ?? 2;
  const fill = options.fill ?? 'transparent';

  let shape: DrawableShape;

  switch (shapeTool) {
    case 'line':
      shape = createConnectorShape('line', start, start, {
        stroke,
        strokeWidth,
      });
      break;
    case 'arrow':
      shape = createConnectorShape('arrow', start, start, {
        stroke,
        strokeWidth,
      });
      break;
    case 'elbowArrow':
      shape = new fabric.Polyline(buildElbowArrowPolylinePoints(start, start), {
        stroke,
        strokeWidth,
        fill: 'transparent',
        strokeUniform: true,
        objectCaching: false,
      });
      break;
    case 'curvedArrow':
      shape = new fabric.Polyline(buildCurvedArrowPolylinePoints(start, start), {
        stroke,
        strokeWidth,
        fill: 'transparent',
        strokeUniform: true,
        objectCaching: false,
      });
      break;
    case 'rectangle':
      shape = new fabric.Rect({
        left: start.x,
        top: start.y,
        width: 1,
        height: 1,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
        rx: 0,
        ry: 0,
      });
      break;
    case 'roundedRectangle':
      shape = new fabric.Rect({
        left: start.x,
        top: start.y,
        width: 1,
        height: 1,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
        rx: ROUNDED_RECT_CORNER_RADIUS,
        ry: ROUNDED_RECT_CORNER_RADIUS,
      });
      break;
    case 'circle':
      shape = new fabric.Ellipse({
        left: start.x,
        top: start.y,
        rx: 0.5,
        ry: 0.5,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
      });
      break;
    case 'diamond':
      shape = new fabric.Polygon(getDiamondPoints(1, 1), {
        left: start.x,
        top: start.y,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
        objectCaching: false,
      });
      break;
    case 'triangle':
      shape = new fabric.Triangle({
        left: start.x,
        top: start.y,
        width: 1,
        height: 1,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
      });
      break;
    case 'star':
      shape = new fabric.Polygon(getStarPoints(1, 1), {
        left: start.x,
        top: start.y,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
        objectCaching: false,
      });
      break;
    case 'hexagon':
      shape = new fabric.Polygon(getHexagonPoints(1, 1), {
        left: start.x,
        top: start.y,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
        objectCaching: false,
      });
      break;
    case 'parallelogram':
      shape = new fabric.Polygon(getParallelogramPoints(1, 1), {
        left: start.x,
        top: start.y,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
        objectCaching: false,
      });
      break;
    case 'blockArrow':
      shape = new fabric.Polygon(getBlockArrowPoints(1, 1), {
        left: start.x,
        top: start.y,
        fill,
        stroke,
        strokeWidth,
        strokeUniform: true,
        objectCaching: false,
      });
      break;
  }

  addObjectId(shape, userId);
  shape.set({
    // Keep shape inert while dragging; Canvas.tsx enables interaction on mouse up.
    selectable: false,
    evented: false,
  });
  (shape as DrawableShape & { [DRAFT_SHAPE_FLAG]?: boolean })[DRAFT_SHAPE_FLAG] = true;
  canvas.add(shape);

  return shape;
}

export function updateDraggedShape(
  shape: DrawableShape,
  shapeTool: ShapeToolType,
  start: ShapePoint,
  current: ShapePoint,
  options: ShapeDragOptions = {}
): void {
  const dragPoint = getDragPoint(shapeTool, start, current, options);

  switch (shapeTool) {
    case 'line': {
      const connector = shape as fabric.Polyline;
      setConnectorStraightGeometry(connector, start, dragPoint);
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'arrow': {
      const polyline = shape as fabric.Polyline;
      setConnectorStraightGeometry(polyline, start, dragPoint);
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'elbowArrow': {
      const polyline = shape as fabric.Polyline;
      polyline.set({
        points: buildElbowArrowPolylinePoints(start, dragPoint),
      });
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'curvedArrow': {
      const polyline = shape as fabric.Polyline;
      polyline.set({
        points: buildCurvedArrowPolylinePoints(start, dragPoint),
      });
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'rectangle': {
      const bounds = getShapeBounds(start, dragPoint);
      const rectangle = shape as fabric.Rect;
      rectangle.set({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });
      break;
    }
    case 'roundedRectangle': {
      const bounds = getShapeBounds(start, dragPoint);
      const roundedRectangle = shape as fabric.Rect;
      roundedRectangle.set({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        rx: ROUNDED_RECT_CORNER_RADIUS,
        ry: ROUNDED_RECT_CORNER_RADIUS,
      });
      break;
    }
    case 'circle': {
      const bounds = getShapeBounds(start, dragPoint);
      const ellipse = shape as fabric.Ellipse;
      ellipse.set({
        left: bounds.left,
        top: bounds.top,
        rx: bounds.width / 2,
        ry: bounds.height / 2,
      });
      break;
    }
    case 'diamond': {
      const bounds = getShapeBounds(start, dragPoint);
      const diamond = shape as fabric.Polygon;
      diamond.set({
        left: bounds.left,
        top: bounds.top,
        points: getDiamondPoints(bounds.width, bounds.height),
      });
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'triangle': {
      const bounds = getShapeBounds(start, dragPoint);
      const triangle = shape as fabric.Triangle;
      triangle.set({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });
      break;
    }
    case 'star': {
      const bounds = getShapeBounds(start, dragPoint);
      const star = shape as fabric.Polygon;
      star.set({
        left: bounds.left,
        top: bounds.top,
        points: getStarPoints(bounds.width, bounds.height),
      });
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'hexagon': {
      const bounds = getShapeBounds(start, dragPoint);
      const hexagon = shape as fabric.Polygon;
      hexagon.set({
        left: bounds.left,
        top: bounds.top,
        points: getHexagonPoints(bounds.width, bounds.height),
      });
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'parallelogram': {
      const bounds = getShapeBounds(start, dragPoint);
      const parallelogram = shape as fabric.Polygon;
      parallelogram.set({
        left: bounds.left,
        top: bounds.top,
        points: getParallelogramPoints(bounds.width, bounds.height),
      });
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
    case 'blockArrow': {
      const bounds = getShapeBounds(start, dragPoint);
      const blockArrow = shape as fabric.Polygon;
      blockArrow.set({
        left: bounds.left,
        top: bounds.top,
        points: getBlockArrowPoints(bounds.width, bounds.height),
      });
      refreshPointBasedShape(shape, shapeTool);
      break;
    }
  }

  shape.setCoords();
}

export function finalizeDraggedShape(
  shape: DrawableShape,
  shapeTool: ShapeToolType,
  start: ShapePoint,
  end: ShapePoint,
  options: ShapeDragOptions = {}
): void {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const maxDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY));

  if (maxDelta >= SHAPE_CLICK_THRESHOLD) {
    updateDraggedShape(shape, shapeTool, start, end, options);
    return;
  }

  switch (shapeTool) {
    case 'line':
    case 'arrow':
    case 'elbowArrow':
    case 'curvedArrow':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_LINE_LENGTH,
        y: start.y,
      });
      break;
    case 'rectangle':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_RECTANGLE_WIDTH,
        y: start.y + DEFAULT_RECTANGLE_HEIGHT,
      });
      break;
    case 'roundedRectangle':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_ROUNDED_RECTANGLE_WIDTH,
        y: start.y + DEFAULT_ROUNDED_RECTANGLE_HEIGHT,
      });
      break;
    case 'circle':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_CIRCLE_DIAMETER,
        y: start.y + DEFAULT_CIRCLE_DIAMETER,
      });
      break;
    case 'diamond':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_DIAMOND_WIDTH,
        y: start.y + DEFAULT_DIAMOND_HEIGHT,
      });
      break;
    case 'triangle':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_TRIANGLE_WIDTH,
        y: start.y + DEFAULT_TRIANGLE_HEIGHT,
      });
      break;
    case 'star':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_STAR_SIZE,
        y: start.y + DEFAULT_STAR_SIZE,
      });
      break;
    case 'hexagon':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_HEXAGON_WIDTH,
        y: start.y + DEFAULT_HEXAGON_HEIGHT,
      });
      break;
    case 'parallelogram':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_PARALLELOGRAM_WIDTH,
        y: start.y + DEFAULT_PARALLELOGRAM_HEIGHT,
      });
      break;
    case 'blockArrow':
      updateDraggedShape(shape, shapeTool, start, {
        x: start.x + DEFAULT_BLOCK_ARROW_WIDTH,
        y: start.y + DEFAULT_BLOCK_ARROW_HEIGHT,
      });
      break;
  }
}
