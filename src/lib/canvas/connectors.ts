import * as fabric from 'fabric';

export type ConnectorKind = 'line' | 'arrow';

export interface ConnectorPoint {
  x: number;
  y: number;
}

interface ConnectorData {
  kind: ConnectorKind;
  start: ConnectorPoint;
  end: ConnectorPoint;
  control: ConnectorPoint;
}

type ConnectorObject = fabric.Polyline & {
  connectorKind?: ConnectorKind;
  connectorStartX?: number;
  connectorStartY?: number;
  connectorEndX?: number;
  connectorEndY?: number;
  connectorControlX?: number;
  connectorControlY?: number;
};

const CONNECTOR_HANDLE_COLOR = '#2563EB';
const CONNECTOR_END_HANDLE_RADIUS = 6;
const CONNECTOR_MID_HANDLE_RADIUS = 5;
const CONNECTOR_HANDLE_TOUCH_SIZE = 30;
const CONNECTOR_HEAD_SIZE = 14;
const CONNECTOR_CURVE_SEGMENTS = 20;
const CONNECTOR_POINT_TOLERANCE = 0.5;

const PERSISTED_METADATA_KEYS = [
  'id',
  'createdBy',
  'createdAt',
  'updatedAt',
  'updatedBy',
] as const;

export const CONNECTOR_HISTORY_PROPS = [
  'connectorKind',
  'connectorStartX',
  'connectorStartY',
  'connectorEndX',
  'connectorEndY',
  'connectorControlX',
  'connectorControlY',
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function midpoint(start: ConnectorPoint, end: ConnectorPoint): ConnectorPoint {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function toFabricPoint(point: ConnectorPoint): fabric.Point {
  return new fabric.Point(point.x, point.y);
}

function toConnectorPoint(point: fabric.Point): ConnectorPoint {
  return { x: point.x, y: point.y };
}

function pointsRoughlyEqual(a: ConnectorPoint, b: ConnectorPoint): boolean {
  return Math.abs(a.x - b.x) <= CONNECTOR_POINT_TOLERANCE &&
    Math.abs(a.y - b.y) <= CONNECTOR_POINT_TOLERANCE;
}

function toScenePointFromPolylinePoint(
  polyline: fabric.Polyline,
  point: ConnectorPoint
): ConnectorPoint {
  const matrix = fabric.util.multiplyTransformMatrices(
    polyline.getViewportTransform(),
    polyline.calcTransformMatrix()
  );
  const pathOffset = polyline.pathOffset ?? new fabric.Point(0, 0);

  return toConnectorPoint(
    new fabric.Point(point.x, point.y).subtract(pathOffset).transform(matrix)
  );
}

function inferStraightConnectorDataFromPolyline(polyline: fabric.Polyline): ConnectorData | null {
  const points = (polyline.points ?? [])
    .map((point) => ({
      x: Number(point.x),
      y: Number(point.y),
    }))
    .filter((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y));

  if (points.length < 2) {
    return null;
  }

  const looksLikeLegacyArrow = points.length >= 5 && pointsRoughlyEqual(points[1], points[3]);
  const looksLikeStraightLine = points.length === 2;

  if (!looksLikeLegacyArrow && !looksLikeStraightLine) {
    return null;
  }

  const start = toScenePointFromPolylinePoint(polyline, points[0]);
  const end = toScenePointFromPolylinePoint(polyline, points[1]);

  return {
    kind: looksLikeLegacyArrow ? 'arrow' : 'line',
    start,
    end,
    control: midpoint(start, end),
  };
}

function inferStraightConnectorDataFromLine(line: fabric.Line): ConnectorData {
  const { x1, y1, x2, y2 } = line.calcLinePoints();
  const matrix = fabric.util.multiplyTransformMatrices(
    line.getViewportTransform(),
    line.calcTransformMatrix()
  );
  const start = toConnectorPoint(new fabric.Point(x1, y1).transform(matrix));
  const end = toConnectorPoint(new fabric.Point(x2, y2).transform(matrix));

  return {
    kind: 'line',
    start,
    end,
    control: midpoint(start, end),
  };
}

function readConnectorData(object: fabric.Object): ConnectorData | null {
  if (!(object instanceof fabric.Polyline)) {
    return null;
  }

  const connector = object as ConnectorObject;
  const kind = connector.connectorKind;
  if (kind !== 'line' && kind !== 'arrow') {
    return null;
  }

  if (
    !isFiniteNumber(connector.connectorStartX) ||
    !isFiniteNumber(connector.connectorStartY) ||
    !isFiniteNumber(connector.connectorEndX) ||
    !isFiniteNumber(connector.connectorEndY) ||
    !isFiniteNumber(connector.connectorControlX) ||
    !isFiniteNumber(connector.connectorControlY)
  ) {
    return null;
  }

  return {
    kind,
    start: {
      x: connector.connectorStartX,
      y: connector.connectorStartY,
    },
    end: {
      x: connector.connectorEndX,
      y: connector.connectorEndY,
    },
    control: {
      x: connector.connectorControlX,
      y: connector.connectorControlY,
    },
  };
}

function getConnectorData(object: fabric.Object): ConnectorData | null {
  const storedData = readConnectorData(object);
  if (storedData) {
    return storedData;
  }

  if (object instanceof fabric.Polyline) {
    return inferStraightConnectorDataFromPolyline(object);
  }

  if (object instanceof fabric.Line) {
    return inferStraightConnectorDataFromLine(object);
  }

  return null;
}

function writeConnectorData(connector: fabric.Polyline, data: ConnectorData): void {
  const target = connector as ConnectorObject;
  target.connectorKind = data.kind;
  target.connectorStartX = data.start.x;
  target.connectorStartY = data.start.y;
  target.connectorEndX = data.end.x;
  target.connectorEndY = data.end.y;
  target.connectorControlX = data.control.x;
  target.connectorControlY = data.control.y;
}

function buildQuadraticCurvePoints(
  start: ConnectorPoint,
  control: ConnectorPoint,
  end: ConnectorPoint
): ConnectorPoint[] {
  const points: ConnectorPoint[] = [];

  for (let step = 0; step <= CONNECTOR_CURVE_SEGMENTS; step += 1) {
    const t = step / CONNECTOR_CURVE_SEGMENTS;
    const oneMinusT = 1 - t;
    points.push({
      x: oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x,
      y: oneMinusT * oneMinusT * start.y + 2 * oneMinusT * t * control.y + t * t * end.y,
    });
  }

  return points;
}

function getArrowHeadPoints(
  from: ConnectorPoint,
  to: ConnectorPoint,
  size: number
): [ConnectorPoint, ConnectorPoint] {
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

function buildConnectorPoints(data: ConnectorData): ConnectorPoint[] {
  const curvePoints = buildQuadraticCurvePoints(data.start, data.control, data.end);
  if (data.kind === 'line') {
    return curvePoints;
  }

  const endIndex = curvePoints.length - 1;
  const arrowBase = curvePoints[Math.max(0, endIndex - 1)] ?? data.control;
  const [headA, headB] = getArrowHeadPoints(arrowBase, data.end, CONNECTOR_HEAD_SIZE);
  return [...curvePoints, headA, data.end, headB];
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

function renderConnectorEndHandle(ctx: CanvasRenderingContext2D, left: number, top: number): void {
  renderCircularHandle(
    ctx,
    left,
    top,
    CONNECTOR_END_HANDLE_RADIUS,
    '#FFFFFF',
    CONNECTOR_HANDLE_COLOR,
    2
  );
}

function renderConnectorMidHandle(ctx: CanvasRenderingContext2D, left: number, top: number): void {
  renderCircularHandle(
    ctx,
    left,
    top,
    CONNECTOR_MID_HANDLE_RADIUS,
    CONNECTOR_HANDLE_COLOR,
    '#FFFFFF',
    2
  );
}

function getConnectorPositionHandler(which: 'start' | 'control' | 'end') {
  return (
    _dim: fabric.Point,
    _finalMatrix: fabric.TMat2D,
    object: fabric.InteractiveFabricObject
  ): fabric.Point => {
    const data = getConnectorData(object as unknown as fabric.Object);
    if (!data) {
      return new fabric.Point(0, 0);
    }

    const point = which === 'start' ? data.start : which === 'end' ? data.end : data.control;
    const viewportTransform =
      (object as unknown as fabric.Object).getViewportTransform?.() ?? [1, 0, 0, 1, 0, 0];
    return toFabricPoint(point).transform(viewportTransform);
  };
}

function createEndpointActionHandler(which: 'start' | 'end') {
  return (
    _eventData: fabric.TPointerEvent,
    transform: fabric.Transform,
    x: number,
    y: number
  ): boolean => {
    const connector = transform.target as fabric.Object;
    const data = getConnectorData(connector);
    if (!data) {
      return false;
    }

    const previousMid = midpoint(data.start, data.end);
    const pointer: ConnectorPoint = { x, y };

    if (which === 'start') {
      data.start = pointer;
    } else {
      data.end = pointer;
    }

    const nextMid = midpoint(data.start, data.end);
    data.control = {
      x: data.control.x + (nextMid.x - previousMid.x),
      y: data.control.y + (nextMid.y - previousMid.y),
    };

    applyConnectorGeometry(connector as fabric.Polyline, data);
    return true;
  };
}

function connectorControlActionHandler(
  _eventData: fabric.TPointerEvent,
  transform: fabric.Transform,
  x: number,
  y: number
): boolean {
  const connector = transform.target as fabric.Object;
  const data = getConnectorData(connector);
  if (!data) {
    return false;
  }

  data.control = { x, y };
  applyConnectorGeometry(connector as fabric.Polyline, data);
  return true;
}

let connectorControlsCache: Record<string, fabric.Control> | null = null;

function getConnectorControls(): Record<string, fabric.Control> {
  if (connectorControlsCache) {
    return connectorControlsCache;
  }

  connectorControlsCache = {
    connectorStart: new fabric.Control({
      positionHandler: getConnectorPositionHandler('start'),
      actionHandler: createEndpointActionHandler('start'),
      cursorStyle: 'grab',
      actionName: 'modifyConnectorStart',
      touchSizeX: CONNECTOR_HANDLE_TOUCH_SIZE,
      touchSizeY: CONNECTOR_HANDLE_TOUCH_SIZE,
      render: renderConnectorEndHandle,
    }),
    connectorControl: new fabric.Control({
      positionHandler: getConnectorPositionHandler('control'),
      actionHandler: connectorControlActionHandler,
      cursorStyle: 'grab',
      actionName: 'modifyConnectorCurve',
      touchSizeX: CONNECTOR_HANDLE_TOUCH_SIZE,
      touchSizeY: CONNECTOR_HANDLE_TOUCH_SIZE,
      render: renderConnectorMidHandle,
    }),
    connectorEnd: new fabric.Control({
      positionHandler: getConnectorPositionHandler('end'),
      actionHandler: createEndpointActionHandler('end'),
      cursorStyle: 'grab',
      actionName: 'modifyConnectorEnd',
      touchSizeX: CONNECTOR_HANDLE_TOUCH_SIZE,
      touchSizeY: CONNECTOR_HANDLE_TOUCH_SIZE,
      render: renderConnectorEndHandle,
    }),
  };

  return connectorControlsCache;
}

export function isConnectorObject(object: fabric.Object | null | undefined): object is fabric.Polyline {
  if (!object) {
    return false;
  }
  return object instanceof fabric.Polyline && getConnectorData(object) !== null;
}

export function applyConnectorGeometry(connector: fabric.Polyline, data: ConnectorData): void {
  writeConnectorData(connector, data);
  connector.set({
    points: buildConnectorPoints(data),
    fill: undefined,
    objectCaching: false,
    hasBorders: false,
    transparentCorners: false,
    cornerStyle: 'circle',
    cornerColor: CONNECTOR_HANDLE_COLOR,
    cornerStrokeColor: '#FFFFFF',
    cornerSize: 11,
    touchCornerSize: 24,
    padding: 0,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    perPixelTargetFind: true,
  });
  connector.controls = getConnectorControls();
  connector.setBoundingBox(true);
  connector.set('dirty', true);
  connector.setCoords();
}

export function createConnectorShape(
  kind: ConnectorKind,
  start: ConnectorPoint,
  end: ConnectorPoint,
  options: {
    stroke: string;
    strokeWidth: number;
  }
): fabric.Polyline {
  const connector = new fabric.Polyline([], {
    stroke: options.stroke,
    strokeWidth: options.strokeWidth,
    strokeUniform: true,
    fill: undefined,
    objectCaching: false,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
  });

  applyConnectorGeometry(connector, {
    kind,
    start,
    end,
    control: midpoint(start, end),
  });

  return connector;
}

export function setConnectorStraightGeometry(
  connector: fabric.Polyline,
  start: ConnectorPoint,
  end: ConnectorPoint
): void {
  const current = getConnectorData(connector);
  const kind: ConnectorKind = current?.kind ?? 'line';

  applyConnectorGeometry(connector, {
    kind,
    start,
    end,
    control: midpoint(start, end),
  });
}

function copyPersistedObjectMetadata(source: fabric.Object, target: fabric.Object): void {
  const sourceRecord = source as unknown as Record<string, unknown>;
  const targetRecord = target as unknown as Record<string, unknown>;

  PERSISTED_METADATA_KEYS.forEach((key) => {
    if (sourceRecord[key] !== undefined) {
      targetRecord[key] = sourceRecord[key];
    }
  });
}

function cloneObjectShadow(shadow: fabric.Object['shadow']): fabric.Object['shadow'] {
  if (shadow instanceof fabric.Shadow) {
    return new fabric.Shadow(shadow.toObject());
  }

  return shadow;
}

function replaceLegacyLineWithConnector(canvas: fabric.Canvas, legacyLine: fabric.Line): fabric.Polyline {
  const legacyData = inferStraightConnectorDataFromLine(legacyLine);
  const stroke = typeof legacyLine.stroke === 'string' ? legacyLine.stroke : '#000000';
  const strokeWidth = isFiniteNumber(legacyLine.strokeWidth) ? legacyLine.strokeWidth : 2;

  const replacement = createConnectorShape('line', legacyData.start, legacyData.end, {
    stroke,
    strokeWidth,
  });

  replacement.set({
    strokeDashArray: legacyLine.strokeDashArray ? [...legacyLine.strokeDashArray] : undefined,
    strokeDashOffset: legacyLine.strokeDashOffset,
    strokeLineCap: legacyLine.strokeLineCap,
    strokeLineJoin: legacyLine.strokeLineJoin,
    strokeMiterLimit: legacyLine.strokeMiterLimit,
    opacity: legacyLine.opacity,
    visible: legacyLine.visible,
    selectable: legacyLine.selectable,
    evented: legacyLine.evented,
    shadow: cloneObjectShadow(legacyLine.shadow),
  });
  copyPersistedObjectMetadata(legacyLine, replacement);

  const objectIndex = canvas.getObjects().indexOf(legacyLine);
  const wasActive = canvas.getActiveObject() === legacyLine;
  canvas.remove(legacyLine);
  canvas.insertAt(Math.max(0, objectIndex), replacement);

  if (wasActive) {
    canvas.setActiveObject(replacement);
  }

  return replacement;
}

export function installConnectorCanvasHooks(canvas: fabric.Canvas): void {
  let isMigratingLegacyLine = false;

  const normalizeConnectorObject = (target?: fabric.Object): fabric.Object | null => {
    if (!target) {
      return null;
    }

    if (target instanceof fabric.Line) {
      if (isMigratingLegacyLine) {
        return target;
      }

      isMigratingLegacyLine = true;
      try {
        return replaceLegacyLineWithConnector(canvas, target);
      } finally {
        isMigratingLegacyLine = false;
      }
    }

    if (!(target instanceof fabric.Polyline)) {
      return target;
    }

    const data = getConnectorData(target);
    if (!data) {
      return target;
    }

    applyConnectorGeometry(target, data);
    return target;
  };

  const enforceConnectorControls = (event: { target?: fabric.Object }) => {
    const normalized = normalizeConnectorObject(event.target);
    if (normalized && normalized !== event.target) {
      canvas.requestRenderAll();
    }
  };

  [...canvas.getObjects()].forEach((object) => {
    normalizeConnectorObject(object);
  });

  canvas.on('object:added', enforceConnectorControls);
}
