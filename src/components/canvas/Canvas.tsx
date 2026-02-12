'use client';

import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCanvas } from './CanvasProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useBoard } from '@/components/providers/BoardProvider';
import { initializeFabricCanvas, resizeCanvas } from '@/lib/canvas/fabricCanvas';
import {
  DRAFT_SHAPE_FLAG,
  createShapeForDrag,
  finalizeDraggedShape,
  isConnectorShapeTool,
  isShapeToolType,
  ShapeToolType,
  updateDraggedShape,
} from '@/lib/canvas/shapeTools';
import { addText } from '@/lib/canvas/textTools';
import {
  DEFAULT_STICKY_NOTE_COLOR,
  STICKY_DEFAULT_HEIGHT,
  STICKY_DEFAULT_WIDTH,
  STICKY_NOTE_COLORS,
  addStickyNote,
  findStickyContainerById,
  focusStickyNoteEditor,
  getStickyContainerForObject,
  getStickyObjectId,
  isStickyObject,
  removeStickyNote,
  typeInStickyNote,
} from '@/lib/canvas/stickyNotes';
import { PressureBrush } from '@/lib/canvas/pressureBrush';
import { addImageFromFile } from '@/lib/canvas/imageTools';
import {
  getUserProfile,
  removePresence,
  saveBoardCanvasState,
  subscribeToBoardCanvas,
  subscribeToPresence,
  updatePresence,
  updatePresenceFields,
} from '@/lib/firebase/database';
import {
  CANVAS_SERIALIZATION_PROPS,
  serializeCanvas,
  stringifyCanvasState,
} from '@/lib/canvas/serialization';
import { APP_CONFIG } from '@/lib/constants/config';
import { generateObjectId } from '@/lib/utils/generateId';
import { validateImageDimensions, validateImageFile } from '@/lib/utils/validators';
import { BoardCanvas, UserPresence } from '@/types/board';
import { loginAnonymously } from '@/lib/firebase/auth';
import styles from './Canvas.module.css';

function shouldEnableSelection(tool: string): boolean {
  return tool === 'select' || tool === 'eraser';
}

function isShapeTool(tool: string): boolean {
  return isShapeToolType(tool);
}

function applyCanvasCursors(
  canvas: fabric.Canvas,
  tool: string,
  options: { grabbing?: boolean; panReady?: boolean } = {}
): void {
  if (options.grabbing) {
    canvas.defaultCursor = 'grabbing';
    canvas.hoverCursor = 'grabbing';
    canvas.moveCursor = 'grabbing';
    return;
  }

  if (options.panReady) {
    canvas.defaultCursor = 'grab';
    canvas.hoverCursor = 'grab';
    canvas.moveCursor = 'grab';
    return;
  }

  canvas.freeDrawingCursor = tool === 'pen' ? 'crosshair' : 'default';

  if (tool === 'hand') {
    canvas.defaultCursor = 'grab';
    canvas.hoverCursor = 'grab';
    canvas.moveCursor = 'grab';
    return;
  }

  if (tool === 'pen') {
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    canvas.moveCursor = 'crosshair';
    return;
  }

  if (isShapeTool(tool)) {
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'move';
    canvas.moveCursor = 'grabbing';
    return;
  }

  if (tool === 'text') {
    canvas.defaultCursor = 'text';
    canvas.hoverCursor = 'text';
    canvas.moveCursor = 'text';
    return;
  }

  if (tool === 'sticky') {
    canvas.defaultCursor = STICKY_CURSOR;
    canvas.hoverCursor = STICKY_CURSOR;
    canvas.moveCursor = STICKY_CURSOR;
    return;
  }

  if (tool === 'image') {
    canvas.defaultCursor = 'copy';
    canvas.hoverCursor = 'copy';
    canvas.moveCursor = 'copy';
    return;
  }

  // select + eraser fallback
  canvas.defaultCursor = FIGMA_SELECT_CURSOR;
  canvas.hoverCursor = FIGMA_SELECT_CURSOR;
  canvas.moveCursor = 'grabbing';
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const KEYBOARD_PAN_STEP = 80;
const KEYBOARD_PAN_STEP_FAST = 220;
const PAN_FRICTION = 0.92;
const PAN_VELOCITY_THRESHOLD = 0.5;
const VELOCITY_SAMPLE_WINDOW = 80;
const GRID_REFERENCE_ZOOM = 1.12;
const GRID_REFERENCE_SPACING = 18;
const GRID_SPACING_SWING = 7.2;
const GRID_MIN_SCREEN_SPACING = GRID_REFERENCE_SPACING - GRID_SPACING_SWING;
const GRID_MAX_SCREEN_SPACING = GRID_REFERENCE_SPACING + GRID_SPACING_SWING;
const GRID_ZOOM_RESPONSE = 0.85;
const GRID_DOT_MIN_SIZE = 1.08;
const GRID_DOT_MAX_SIZE = 1.78;
const GRID_OPACITY_MIN_SCALE = 1.46;
const GRID_OPACITY_MAX_SCALE = 2.04;
const IMAGE_PASTE_OFFSET = 24;
const IMAGE_PASTE_NOTICE_TIMEOUT_MS = 3800;
const CANVAS_SYNC_DEBOUNCE_MS = 220;
const HYDRATION_OVERLAY_DELAY_MS = 220;
const CURSOR_SYNC_INTERVAL_MS = 80;
const DRAW_TRAIL_SYNC_INTERVAL_MS = 80;
const DRAW_TRAIL_MAX_POINTS = 32;
const DRAW_TRAIL_MIN_DISTANCE = 0.8;
const REMOTE_CURSOR_TTL_MS = 45_000;
const CANVAS_SYNC_DEBUG = process.env.NEXT_PUBLIC_CANVAS_SYNC_DEBUG === 'true';
const CANVAS_CACHE_KEY_PREFIX = 'liveboard-canvas-cache:';
const OPEN_IMAGE_PICKER_EVENT = 'liveboard:open-image-picker';
const FIGMA_SELECT_CURSOR = 'url("/cursor.svg?v=2") 1 1, crosshair';
const STICKY_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27 viewBox=%270 0 32 32%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Crect x=%278%27 y=%273%27 width=%2716%27 height=%2726%27 rx=%272.5%27 fill=%27%23F6E46C%27 stroke=%27%232E3A4A%27 stroke-width=%271.8%27/%3E%3Cpath d=%27M19 3v5h5%27 stroke=%27%232E3A4A%27 stroke-width=%271.8%27 stroke-linecap=%27round%27/%3E%3Cpath d=%27M12 13.5h8M12 17.5h6%27 stroke=%27%23515F73%27 stroke-width=%271.5%27 stroke-linecap=%27round%27/%3E%3C/g%3E%3C/svg%3E") 5 4, copy';

interface TrackedCanvasObject extends fabric.Object {
  id?: string;
  createdBy?: string;
  createdAt?: number;
  updatedBy?: string;
  updatedAt?: number;
}

interface PresenceIdentity {
  displayName: string;
  emoji: string;
  color: string;
}

interface PendingCanvasPersist {
  state: BoardCanvas;
  hash: string;
  mutationOrder: number;
}

type SerializedCanvasObject = Record<string, unknown>;

type DraftShapeObject = fabric.Object & {
  [DRAFT_SHAPE_FLAG]?: boolean;
};

type PendingCanvasMutation =
  | {
      kind: 'upsert';
      object: SerializedCanvasObject;
      updatedAt: number;
      order: number;
    }
  | {
      kind: 'delete';
      deletedAt: number;
      order: number;
    };

function logCanvasSync(...args: unknown[]): void {
  if (!CANVAS_SYNC_DEBUG) {
    return;
  }
  console.debug('[CanvasSync]', ...args);
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function readSerializedObjectId(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function serializeCanvasObject(object: fabric.Object): SerializedCanvasObject | null {
  const serializer = object as fabric.Object & {
    toObject: (propertiesToInclude?: string[]) => SerializedCanvasObject;
  };
  if (typeof serializer.toObject !== 'function') {
    return null;
  }
  return serializer.toObject([...CANVAS_SERIALIZATION_PROPS]);
}

function ensureTrackedMetadata(
  object: fabric.Object | undefined,
  userId: string,
  options: { touchUpdated?: boolean } = { touchUpdated: true }
): void {
  if (!object) {
    return;
  }

  const tracked = object as TrackedCanvasObject;
  const now = Date.now();

  if (!tracked.id) {
    tracked.id = generateObjectId();
  }

  if (!tracked.createdBy) {
    tracked.createdBy = userId;
  }

  if (typeof tracked.createdAt !== 'number' || !Number.isFinite(tracked.createdAt)) {
    tracked.createdAt = now;
  }

  if (options.touchUpdated !== false) {
    tracked.updatedBy = userId;
    tracked.updatedAt = now;
  }
}

function isDraftShapeObject(object: fabric.Object | undefined): object is DraftShapeObject {
  if (!object) {
    return false;
  }
  return Boolean((object as DraftShapeObject)[DRAFT_SHAPE_FLAG]);
}

function normalizeCanvasBackground(value: unknown): string {
  if (typeof value !== 'string') {
    return 'transparent';
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return 'transparent';
  }

  // Legacy board payloads used an opaque white background which hides the CSS dot grid.
  const compactValue = trimmedValue.toLowerCase().replace(/\s+/g, '');
  if (
    compactValue === '#fff' ||
    compactValue === '#ffffff' ||
    compactValue === 'white' ||
    compactValue === 'rgb(255,255,255)' ||
    compactValue === 'rgba(255,255,255,1)' ||
    compactValue === 'rgba(255,255,255,100%)'
  ) {
    return 'transparent';
  }

  return trimmedValue;
}

function normalizeObjectFills(objects: unknown[]): unknown[] {
  return objects.map((obj) => {
    if (obj == null || typeof obj !== 'object') return obj;
    const record = obj as Record<string, unknown>;

    // Replace null/undefined fill with 'transparent' to prevent
    // Firebase RTDB from stripping it and Fabric.js defaulting to black.
    if (record.fill === null || record.fill === undefined) {
      record.fill = 'transparent';
    }

    // Recursively handle nested objects (Groups)
    if (Array.isArray(record.objects)) {
      record.objects = normalizeObjectFills(record.objects as unknown[]);
    }

    return record;
  });
}

function normalizeBoardCanvasState(value: BoardCanvas | null | undefined): BoardCanvas {
  const rawObjects = Array.isArray(value?.objects) ? value.objects : [];
  const seenObjectIds = new Set<string>();
  const objects: unknown[] = [];

  // Keep the latest occurrence for duplicate object IDs that may exist in
  // corrupted remote payloads.
  for (let index = rawObjects.length - 1; index >= 0; index -= 1) {
    const object = rawObjects[index];
    const objectId = readSerializedObjectId(object);
    if (objectId) {
      if (seenObjectIds.has(objectId)) {
        continue;
      }
      seenObjectIds.add(objectId);
    }
    objects.push(object);
  }
  objects.reverse();

  const normalizedObjects = normalizeObjectFills(objects);

  const version =
    typeof value?.version === 'string' && value.version.length > 0
      ? value.version
      : '6.0.0';
  const background = normalizeCanvasBackground(value?.background);

  return {
    ...(value ?? {}),
    version,
    objects: normalizedObjects,
    background,
  };
}

function getCanvasCacheKey(boardId: string): string {
  return `${CANVAS_CACHE_KEY_PREFIX}${boardId}`;
}

function readCachedBoardCanvas(boardId: string): BoardCanvas | null {
  if (!boardId || typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getCanvasCacheKey(boardId));
    if (!raw) {
      return null;
    }
    return normalizeBoardCanvasState(JSON.parse(raw) as BoardCanvas);
  } catch {
    return null;
  }
}

function writeCachedBoardCanvas(boardId: string, canvasState: BoardCanvas): void {
  if (!boardId || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      getCanvasCacheKey(boardId),
      stringifyCanvasState(canvasState)
    );
  } catch {
    // Ignore cache write failures (storage quotas, private mode, etc).
  }
}

function toViewportCoordinates(
  canvas: fabric.Canvas,
  scenePoint: { x: number; y: number }
): { x: number; y: number } {
  const vpt = canvas.viewportTransform;
  if (!vpt) {
    return scenePoint;
  }

  return {
    x: scenePoint.x * vpt[0] + vpt[4],
    y: scenePoint.y * vpt[3] + vpt[5],
  };
}

interface StickySelectionState {
  id: string;
}

function isTextInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
    return true;
  }

  return (activeElement as HTMLElement).isContentEditable;
}

function isPlainTypingKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

function getClipboardImageFiles(event: ClipboardEvent): File[] {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return [];

  const imageFiles: File[] = [];

  const items = Array.from(clipboardData.items ?? []);
  items.forEach((item) => {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) {
      return;
    }

    const file = item.getAsFile();
    if (file) {
      imageFiles.push(file);
    }
  });

  if (imageFiles.length > 0) {
    return imageFiles;
  }

  const files = Array.from(clipboardData.files ?? []);
  return files.filter((file) => file.type.startsWith('image/'));
}

function getViewportCenterInScene(canvas: fabric.Canvas): { x: number; y: number } {
  const vpt = canvas.viewportTransform;
  const centerX = canvas.getWidth() / 2;
  const centerY = canvas.getHeight() / 2;

  if (!vpt || vpt[0] === 0 || vpt[3] === 0) {
    return { x: centerX, y: centerY };
  }

  return {
    x: (centerX - vpt[4]) / vpt[0],
    y: (centerY - vpt[5]) / vpt[3],
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }
  return clampNumber((value - min) / (max - min), 0, 1);
}

function lerpNumber(start: number, end: number, t: number): number {
  return start + (end - start) * clampNumber(t, 0, 1);
}

function resolveGridOffset(translation: number, cellSize: number): number {
  if (!Number.isFinite(translation) || !Number.isFinite(cellSize) || cellSize <= 0) {
    return 0;
  }
  return translation % cellSize;
}

function resolveGridVisualMetrics(zoomLevel: number): {
  cellSize: number;
  dotSize: number;
  opacityScale: number;
} {
  const safeZoom = clampNumber(zoomLevel, MIN_ZOOM, MAX_ZOOM);
  const zoomDelta = Math.log(safeZoom / GRID_REFERENCE_ZOOM);
  const cellSize = clampNumber(
    GRID_REFERENCE_SPACING + GRID_SPACING_SWING * Math.tanh(zoomDelta * GRID_ZOOM_RESPONSE),
    GRID_MIN_SCREEN_SPACING,
    GRID_MAX_SCREEN_SPACING
  );
  const normalizedCellSize = normalizeNumber(
    cellSize,
    GRID_MIN_SCREEN_SPACING,
    GRID_MAX_SCREEN_SPACING
  );

  return {
    cellSize,
    dotSize: lerpNumber(GRID_DOT_MIN_SIZE, GRID_DOT_MAX_SIZE, normalizedCellSize),
    opacityScale: lerpNumber(
      GRID_OPACITY_MIN_SCALE,
      GRID_OPACITY_MAX_SCALE,
      normalizedCellSize
    ),
  };
}

function resolveGridZoomLevel(canvas: fabric.Canvas): number {
  const zoomLevel = canvas.getZoom();
  if (!Number.isFinite(zoomLevel) || zoomLevel <= 0) {
    return MIN_ZOOM;
  }
  return clampNumber(zoomLevel, MIN_ZOOM, MAX_ZOOM);
}

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const lastPosXRef = useRef(0);
  const lastPosYRef = useRef(0);
  const spacebarPressedRef = useRef(false);
  const middleMousePanningRef = useRef(false);
  const modifierPanningRef = useRef(false);
  const panSamplesRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const panInertiaFrameRef = useRef<number | null>(null);
  const gestureScaleRef = useRef(1);
  const imagePasteNoticeTimerRef = useRef<number | null>(null);
  const [hasSelection, setHasSelection] = React.useState(false);
  const [selectedSticky, setSelectedSticky] = React.useState<StickySelectionState | null>(null);
  const [stickyPlacementColor, setStickyPlacementColor] = React.useState(DEFAULT_STICKY_NOTE_COLOR);
  const [imagePasteNotice, setImagePasteNotice] = React.useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const {
    canvas,
    setCanvas,
    activeTool,
    setActiveTool,
    strokeColor,
    fillColor,
    strokeWidth,
    pressureSimulation,
    zoom,
    setZoom,
    undo,
    redo,
  } = useCanvas();
  const params = useParams<{ boardId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { canEdit } = useBoard();
  const boardId = typeof params?.boardId === 'string' ? params.boardId : '';
  const actorId = user?.id ?? 'guest-user';
  const syncUserId = user?.id ?? null;
  const canEditBoard = canEdit;
  const effectiveTool = canEditBoard ? activeTool : 'hand';
  const presenceSessionIdRef = useRef<string>(`presence-${generateObjectId()}`);
  const localPresenceSessionId = presenceSessionIdRef.current;
  const [presenceByUser, setPresenceByUser] = React.useState<Record<string, UserPresence>>({});
  const [canvasHydrated, setCanvasHydrated] = React.useState(false);
  const [showHydrationOverlay, setShowHydrationOverlay] = React.useState(false);
  const [presenceIdentity, setPresenceIdentity] = React.useState<PresenceIdentity>({
    displayName: user?.displayName || 'Anonymous',
    emoji: user?.emoji || '👤',
    color: user?.color || '#2563EB',
  });
  const activeToolRef = useRef(activeTool);
  const [viewportTick, setViewportTick] = React.useState(0);
  const canvasSyncTimerRef = useRef<number | null>(null);
  const pendingCanvasPersistRef = useRef<PendingCanvasPersist | null>(null);
  const isPersistingCanvasRef = useRef(false);
  const isApplyingRemoteCanvasRef = useRef(false);
  const lastCanvasHashRef = useRef<string | null>(null);
  const pendingCanvasMutationsRef = useRef<Map<string, PendingCanvasMutation>>(new Map());
  const pendingMutationOrderRef = useRef(0);
  const cursorFlushTimerRef = useRef<number | null>(null);
  const queuedCursorRef = useRef<{ x: number; y: number } | null>(null);
  const lastCursorSentAtRef = useRef(0);
  const lastCursorSentRef = useRef<{ x: number; y: number } | null>(null);
  const drawingFlushTimerRef = useRef<number | null>(null);
  const localDrawingTrailRef = useRef<Array<{ x: number; y: number }>>([]);
  const lastDrawingSentAtRef = useRef(0);
  const isLocalDrawingRef = useRef(false);
  const viewportTickThrottleRef = useRef(0);
  const hasSeenInitialRemoteCanvasRef = useRef(false);
  const autoLoginAttemptedRef = useRef(false);

  useEffect(() => {
    if (authLoading || user?.id || autoLoginAttemptedRef.current) {
      return;
    }

    autoLoginAttemptedRef.current = true;
    void loginAnonymously().catch((error) => {
      console.error('Failed to authenticate anonymous board session:', error);
      autoLoginAttemptedRef.current = false;
    });
  }, [authLoading, user?.id]);

  useEffect(() => {
    activeToolRef.current = effectiveTool;

    if (effectiveTool !== 'pen') {
      isLocalDrawingRef.current = false;
      localDrawingTrailRef.current = [];
      if (drawingFlushTimerRef.current !== null) {
        window.clearTimeout(drawingFlushTimerRef.current);
        drawingFlushTimerRef.current = null;
      }
    }
  }, [effectiveTool]);

  useEffect(() => {
    if (!boardId || !syncUserId) {
      return;
    }

    void updatePresenceFields(boardId, localPresenceSessionId, {
      activity: {
        tool: effectiveTool,
        isDrawing: false,
        trail: [],
        updatedAt: Date.now(),
      },
    });
  }, [boardId, effectiveTool, localPresenceSessionId, syncUserId]);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const fabricCanvas = initializeFabricCanvas(canvasRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    setCanvas(fabricCanvas);

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current) {
        resizeCanvas(
          fabricCanvas,
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      fabricCanvas.dispose();
    };
  }, [setCanvas]);

  useEffect(() => {
    if (!canvas || !containerRef.current) return;

    const syncGridToViewport = () => {
      if (!containerRef.current) return;

      const zoomLevel = resolveGridZoomLevel(canvas);
      const { cellSize, dotSize, opacityScale } = resolveGridVisualMetrics(zoomLevel);
      const vpt = canvas.viewportTransform;
      const translateX = vpt?.[4] ?? 0;
      const translateY = vpt?.[5] ?? 0;
      const offsetX = roundCoordinate(resolveGridOffset(translateX, cellSize));
      const offsetY = roundCoordinate(resolveGridOffset(translateY, cellSize));

      containerRef.current.style.setProperty('--grid-cell-size', `${roundCoordinate(cellSize)}px`);
      containerRef.current.style.setProperty(
        '--grid-minor-dot-size',
        `${roundCoordinate(dotSize)}px`
      );
      containerRef.current.style.setProperty(
        '--grid-minor-opacity-scale',
        opacityScale.toFixed(3)
      );
      containerRef.current.style.setProperty(
        '--grid-minor-offset-x',
        `${offsetX}px`
      );
      containerRef.current.style.setProperty(
        '--grid-minor-offset-y',
        `${offsetY}px`
      );
    };

    syncGridToViewport();
    canvas.on('after:render', syncGridToViewport);

    return () => {
      canvas.off('after:render', syncGridToViewport);
    };
  }, [canvas]);

  useEffect(() => {
    hasSeenInitialRemoteCanvasRef.current = false;
    setCanvasHydrated(false);
    setShowHydrationOverlay(false);
    pendingCanvasPersistRef.current = null;
    pendingCanvasMutationsRef.current.clear();
    pendingMutationOrderRef.current = 0;
    lastCanvasHashRef.current = null;
  }, [boardId, canvas]);

  useEffect(() => {
    if (canvasHydrated) {
      setShowHydrationOverlay(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowHydrationOverlay(true);
    }, HYDRATION_OVERLAY_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [canvasHydrated]);

  useEffect(() => {
    if (!canvas || !boardId) {
      return;
    }

    const cachedCanvas = readCachedBoardCanvas(boardId);
    if (!cachedCanvas) {
      return;
    }

    isApplyingRemoteCanvasRef.current = true;
    void canvas
      .loadFromJSON(cachedCanvas as unknown as Record<string, unknown>)
      .then(() => {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      })
      .catch((error) => {
        console.warn('Failed to load cached board canvas:', error);
      })
      .finally(() => {
        isApplyingRemoteCanvasRef.current = false;
      });
  }, [boardId, canvas]);

  const enqueueObjectUpsertMutation = React.useCallback(
    (object: fabric.Object | undefined) => {
      if (!object) {
        return;
      }

      ensureTrackedMetadata(object, actorId);
      const trackedObject = object as TrackedCanvasObject;
      if (!trackedObject.id) {
        return;
      }

      const serializedObject = serializeCanvasObject(object);
      if (!serializedObject) {
        return;
      }

      const updatedAt =
        typeof trackedObject.updatedAt === 'number' && Number.isFinite(trackedObject.updatedAt)
          ? trackedObject.updatedAt
          : Date.now();
      pendingCanvasMutationsRef.current.set(trackedObject.id, {
        kind: 'upsert',
        object: serializedObject,
        updatedAt,
        order: pendingMutationOrderRef.current++,
      });
    },
    [actorId]
  );

  const enqueueObjectDeleteMutation = React.useCallback((object: fabric.Object | undefined) => {
    if (!object) {
      return;
    }

    const trackedObject = object as TrackedCanvasObject;
    if (!trackedObject.id) {
      return;
    }

    pendingCanvasMutationsRef.current.set(trackedObject.id, {
      kind: 'delete',
      deletedAt: Date.now(),
      order: pendingMutationOrderRef.current++,
    });
  }, []);

  const prunePersistedMutations = React.useCallback((maxMutationOrder: number) => {
    if (maxMutationOrder < 0) {
      return;
    }

    for (const [objectId, mutation] of pendingCanvasMutationsRef.current.entries()) {
      if (mutation.order <= maxMutationOrder) {
        pendingCanvasMutationsRef.current.delete(objectId);
      }
    }
  }, []);

  const flushCanvasPersist = React.useCallback(async () => {
    if (!boardId || !syncUserId || !canEditBoard) {
      return;
    }
    if (isPersistingCanvasRef.current || !pendingCanvasPersistRef.current) {
      return;
    }

    const nextPersist = pendingCanvasPersistRef.current;
    pendingCanvasPersistRef.current = null;
    isPersistingCanvasRef.current = true;

    try {
      await saveBoardCanvasState(boardId, nextPersist.state, syncUserId);
      writeCachedBoardCanvas(boardId, nextPersist.state);
      lastCanvasHashRef.current = nextPersist.hash;
      prunePersistedMutations(nextPersist.mutationOrder);
    } catch (error) {
      console.error('Error syncing canvas state:', error);
    } finally {
      isPersistingCanvasRef.current = false;
      if (pendingCanvasPersistRef.current) {
        void flushCanvasPersist();
      }
    }
  }, [boardId, canEditBoard, prunePersistedMutations, syncUserId]);

  const persistCanvasNow = React.useCallback(() => {
    if (
      !canvas ||
      !boardId ||
      !syncUserId ||
      !canEditBoard ||
      !hasSeenInitialRemoteCanvasRef.current ||
      isApplyingRemoteCanvasRef.current
    ) {
      return;
    }

    if (canvasSyncTimerRef.current !== null) {
      window.clearTimeout(canvasSyncTimerRef.current);
      canvasSyncTimerRef.current = null;
    }

    // Temporarily discard any ActiveSelection so that objects are serialized
    // with their absolute canvas coordinates instead of group-relative ones.
    const activeObject = canvas.getActiveObject();
    const selectedObjects =
      activeObject instanceof fabric.ActiveSelection
        ? [...canvas.getActiveObjects()]
        : [];
    if (selectedObjects.length > 0) {
      canvas.discardActiveObject();
    }

    canvas.getObjects().forEach((object) => {
      ensureTrackedMetadata(object, actorId, { touchUpdated: false });
    });

    const serializedCanvas = serializeCanvas(canvas);
    const normalizedCanvas = normalizeBoardCanvasState(serializedCanvas as BoardCanvas);
    const nextHash = stringifyCanvasState(normalizedCanvas);
    const pendingHash = pendingCanvasPersistRef.current?.hash ?? null;

    if (nextHash === lastCanvasHashRef.current && nextHash === pendingHash) {
      if (selectedObjects.length > 0) {
        const sel = new fabric.ActiveSelection(selectedObjects, { canvas });
        canvas.setActiveObject(sel);
      }
      return;
    }

    writeCachedBoardCanvas(boardId, normalizedCanvas);

    pendingCanvasPersistRef.current = {
      state: normalizedCanvas,
      hash: nextHash,
      mutationOrder: pendingMutationOrderRef.current - 1,
    };
    void flushCanvasPersist();

    // Restore the multi-selection so the user doesn't lose their selection.
    if (selectedObjects.length > 0) {
      const sel = new fabric.ActiveSelection(selectedObjects, { canvas });
      canvas.setActiveObject(sel);
    }
  }, [actorId, boardId, canvas, canEditBoard, flushCanvasPersist, syncUserId]);

  const scheduleCanvasPersist = React.useCallback(() => {
    if (
      !canvas ||
      !boardId ||
      !syncUserId ||
      !canEditBoard ||
      !canvasHydrated ||
      !hasSeenInitialRemoteCanvasRef.current ||
      isApplyingRemoteCanvasRef.current
    ) {
      return;
    }

    if (canvasSyncTimerRef.current !== null) {
      window.clearTimeout(canvasSyncTimerRef.current);
    }

    canvasSyncTimerRef.current = window.setTimeout(() => {
      persistCanvasNow();
    }, CANVAS_SYNC_DEBOUNCE_MS);
  }, [boardId, canvas, canEditBoard, canvasHydrated, persistCanvasNow, syncUserId]);

  useEffect(() => {
    return () => {
      if (canvasSyncTimerRef.current !== null) {
        window.clearTimeout(canvasSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!canvas || !boardId) {
      return;
    }

    let isCancelled = false;
    const hydrationTimeout = window.setTimeout(() => {
      if (isCancelled || hasSeenInitialRemoteCanvasRef.current) {
        return;
      }
      setCanvasHydrated(true);
    }, 3000);

    const markHydrated = () => {
      if (isCancelled || hasSeenInitialRemoteCanvasRef.current) {
        return;
      }
      hasSeenInitialRemoteCanvasRef.current = true;
      setCanvasHydrated(true);
      window.clearTimeout(hydrationTimeout);
    };

    const unsubscribe = subscribeToBoardCanvas(boardId, (remoteCanvasState) => {
      if (isCancelled) {
        return;
      }

      const normalizedState = normalizeBoardCanvasState(remoteCanvasState);
      writeCachedBoardCanvas(boardId, normalizedState);
      const remoteHash = stringifyCanvasState(normalizedState);
      logCanvasSync('remote:update', {
        boardId,
        remoteObjects: normalizedState.objects.length,
      });

      if (remoteHash === lastCanvasHashRef.current) {
        if (pendingCanvasPersistRef.current?.hash === remoteHash) {
          pendingCanvasPersistRef.current = null;
          pendingCanvasMutationsRef.current.clear();
        }
        logCanvasSync('remote:skip:lastHash');
        markHydrated();
        return;
      }

      const localHash = stringifyCanvasState(serializeCanvas(canvas));
      if (remoteHash === localHash) {
        lastCanvasHashRef.current = remoteHash;
        pendingCanvasPersistRef.current = null;
        pendingCanvasMutationsRef.current.clear();
        logCanvasSync('remote:skip:matchesLocal');
        markHydrated();
        return;
      }

      const pendingLocalHash = pendingCanvasPersistRef.current?.hash ?? null;
      const hasPendingMutations = pendingCanvasMutationsRef.current.size > 0;

      if (pendingLocalHash !== null || hasPendingMutations) {
        logCanvasSync('remote:defer:pendingLocal', {
          pendingHash: pendingLocalHash,
          hasPendingMutations,
          pendingMutationCount: pendingCanvasMutationsRef.current.size,
        });
        markHydrated();
        return;
      }

      logCanvasSync('remote:applyToCanvas', {
        boardId,
        remoteObjects: normalizedState.objects.length,
      });
      isApplyingRemoteCanvasRef.current = true;
      void canvas
        .loadFromJSON(normalizedState as unknown as Record<string, unknown>)
        .then(() => {
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          lastCanvasHashRef.current = remoteHash;
        })
        .catch((error) => {
          console.error('Error loading remote canvas state:', error);
        })
        .finally(() => {
          isApplyingRemoteCanvasRef.current = false;
          markHydrated();
        });
    });

    return () => {
      isCancelled = true;
      window.clearTimeout(hydrationTimeout);
      unsubscribe();
    };
  }, [boardId, canvas, flushCanvasPersist]);

  useEffect(() => {
    if (!canvas || !boardId || !syncUserId || !canEditBoard) {
      return;
    }

    const handleObjectAdded = (event: { target?: fabric.Object }) => {
      if (isApplyingRemoteCanvasRef.current) {
        return;
      }
      if (isDraftShapeObject(event.target)) {
        return;
      }
      logCanvasSync('local:objectAdded', {
        type: event.target?.type,
        id: (event.target as TrackedCanvasObject | undefined)?.id ?? null,
      });
      enqueueObjectUpsertMutation(event.target);
      scheduleCanvasPersist();
    };

    const handleObjectModified = (event: { target?: fabric.Object }) => {
      if (isApplyingRemoteCanvasRef.current) {
        return;
      }
      if (isDraftShapeObject(event.target)) {
        return;
      }
      logCanvasSync('local:objectModified', {
        type: event.target?.type,
        id: (event.target as TrackedCanvasObject | undefined)?.id ?? null,
      });
      // When the target is an ActiveSelection (multi-select move/resize),
      // enqueue mutations for each individual object so the pending-mutation
      // guard correctly prevents stale remote overwrites.
      if (event.target instanceof fabric.ActiveSelection) {
        event.target.getObjects().forEach((obj) => {
          enqueueObjectUpsertMutation(obj);
        });
      } else {
        enqueueObjectUpsertMutation(event.target);
      }
      scheduleCanvasPersist();
    };

    const handleObjectRemoved = (event: { target?: fabric.Object }) => {
      if (isApplyingRemoteCanvasRef.current) {
        return;
      }
      logCanvasSync('local:objectRemoved', {
        type: event.target?.type,
        id: (event.target as TrackedCanvasObject | undefined)?.id ?? null,
      });
      enqueueObjectDeleteMutation(event.target);
      scheduleCanvasPersist();
    };

    const handlePathCreated = (event: { path?: fabric.Object }) => {
      if (isApplyingRemoteCanvasRef.current) {
        return;
      }
      logCanvasSync('local:pathCreated', {
        type: event.path?.type,
        id: (event.path as TrackedCanvasObject | undefined)?.id ?? null,
      });
      enqueueObjectUpsertMutation(event.path);
      scheduleCanvasPersist();
      persistCanvasNow();
    };

    const handleTextChanged = (event: { target?: fabric.Object }) => {
      if (isApplyingRemoteCanvasRef.current) {
        return;
      }
      enqueueObjectUpsertMutation(event.target);
      scheduleCanvasPersist();
    };

    canvas.on('object:added', handleObjectAdded);
    canvas.on('object:modified', handleObjectModified);
    canvas.on('object:removed', handleObjectRemoved);
    canvas.on('path:created', handlePathCreated);
    canvas.on('text:changed', handleTextChanged);

    return () => {
      canvas.off('object:added', handleObjectAdded);
      canvas.off('object:modified', handleObjectModified);
      canvas.off('object:removed', handleObjectRemoved);
      canvas.off('path:created', handlePathCreated);
      canvas.off('text:changed', handleTextChanged);
    };
  }, [
    boardId,
    canvas,
    canEditBoard,
    enqueueObjectDeleteMutation,
    enqueueObjectUpsertMutation,
    persistCanvasNow,
    scheduleCanvasPersist,
    syncUserId,
  ]);

  useEffect(() => {
    if (!canvas || !boardId || !syncUserId || !canvasHydrated || !canEditBoard) {
      return;
    }

    scheduleCanvasPersist();
  }, [boardId, canvas, canEditBoard, canvasHydrated, scheduleCanvasPersist, syncUserId]);

  useEffect(() => {
    if (!canvas || !boardId || !syncUserId || !canEditBoard) {
      return;
    }

    const flushForNavigation = () => {
      persistCanvasNow();
    };

    const handleVisibilityFlush = () => {
      if (document.visibilityState !== 'hidden') {
        return;
      }
      flushForNavigation();
    };

    window.addEventListener('pagehide', flushForNavigation);
    window.addEventListener('beforeunload', flushForNavigation);
    document.addEventListener('visibilitychange', handleVisibilityFlush);

    return () => {
      window.removeEventListener('pagehide', flushForNavigation);
      window.removeEventListener('beforeunload', flushForNavigation);
      document.removeEventListener('visibilitychange', handleVisibilityFlush);
    };
  }, [boardId, canvas, canEditBoard, persistCanvasNow, syncUserId]);

  useEffect(() => {
    if (!syncUserId) {
      setPresenceIdentity({
        displayName: user?.displayName || 'Anonymous',
        emoji: user?.emoji || '👤',
        color: user?.color || '#2563EB',
      });
      return;
    }

    let isCancelled = false;

    const loadPresenceIdentity = async () => {
      try {
        const profile = await getUserProfile(syncUserId);
        if (isCancelled) {
          return;
        }

        setPresenceIdentity({
          displayName: profile?.displayName || user?.displayName || 'Anonymous',
          emoji: profile?.emoji || user?.emoji || '👤',
          color: profile?.color || user?.color || '#2563EB',
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }
        console.error('Error loading user profile for presence:', error);
        setPresenceIdentity({
          displayName: user?.displayName || 'Anonymous',
          emoji: user?.emoji || '👤',
          color: user?.color || '#2563EB',
        });
      }
    };

    void loadPresenceIdentity();

    return () => {
      isCancelled = true;
    };
  }, [syncUserId, user?.color, user?.displayName, user?.emoji]);

  useEffect(() => {
    if (!boardId) {
      return;
    }
    return subscribeToPresence(boardId, setPresenceByUser);
  }, [boardId]);

  useEffect(() => {
    if (!canvas || !boardId || !syncUserId) {
      return;
    }

    let isDisposed = false;

    const initialPresence: UserPresence = {
      userId: syncUserId,
      sessionId: localPresenceSessionId,
      displayName: presenceIdentity.displayName,
      color: presenceIdentity.color,
      emoji: presenceIdentity.emoji,
      cursor: { x: 0, y: 0 },
      lastSeen: Date.now(),
      isActive: true,
      activity: {
        tool: activeToolRef.current,
        isDrawing: false,
        trail: [],
        updatedAt: Date.now(),
      },
    };

    void updatePresence(boardId, localPresenceSessionId, initialPresence);
    lastCursorSentAtRef.current = 0;
    lastCursorSentRef.current = null;
    queuedCursorRef.current = null;
    lastDrawingSentAtRef.current = 0;
    localDrawingTrailRef.current = [];
    isLocalDrawingRef.current = false;

    const flushCursor = () => {
      if (isDisposed || !queuedCursorRef.current) {
        return;
      }

      const nextCursor = queuedCursorRef.current;
      queuedCursorRef.current = null;

      const lastCursor = lastCursorSentRef.current;
      if (lastCursor && lastCursor.x === nextCursor.x && lastCursor.y === nextCursor.y) {
        return;
      }

      lastCursorSentAtRef.current = Date.now();
      lastCursorSentRef.current = nextCursor;
      void updatePresenceFields(boardId, localPresenceSessionId, {
        cursor: nextCursor,
        isActive: true,
      });
    };

    const queueCursorSync = (cursor: { x: number; y: number }) => {
      queuedCursorRef.current = cursor;
      const elapsed = Date.now() - lastCursorSentAtRef.current;

      if (elapsed >= CURSOR_SYNC_INTERVAL_MS) {
        if (cursorFlushTimerRef.current !== null) {
          window.clearTimeout(cursorFlushTimerRef.current);
          cursorFlushTimerRef.current = null;
        }
        flushCursor();
        return;
      }

      if (cursorFlushTimerRef.current !== null) {
        return;
      }

      cursorFlushTimerRef.current = window.setTimeout(() => {
        cursorFlushTimerRef.current = null;
        flushCursor();
      }, Math.max(12, CURSOR_SYNC_INTERVAL_MS - elapsed));
    };

    const flushDrawingTrail = () => {
      if (isDisposed || !isLocalDrawingRef.current) {
        return;
      }

      const trail = localDrawingTrailRef.current;
      if (trail.length === 0) {
        return;
      }

      lastDrawingSentAtRef.current = Date.now();
      void updatePresenceFields(boardId, localPresenceSessionId, {
        activity: {
          tool: 'pen',
          isDrawing: true,
          trail,
          updatedAt: Date.now(),
        },
      });
    };

    const queueDrawingTrailSync = () => {
      const elapsed = Date.now() - lastDrawingSentAtRef.current;
      if (elapsed >= DRAW_TRAIL_SYNC_INTERVAL_MS) {
        if (drawingFlushTimerRef.current !== null) {
          window.clearTimeout(drawingFlushTimerRef.current);
          drawingFlushTimerRef.current = null;
        }
        flushDrawingTrail();
        return;
      }

      if (drawingFlushTimerRef.current !== null) {
        return;
      }

      drawingFlushTimerRef.current = window.setTimeout(() => {
        drawingFlushTimerRef.current = null;
        flushDrawingTrail();
      }, Math.max(12, DRAW_TRAIL_SYNC_INTERVAL_MS - elapsed));
    };

    const handlePointerActivity = (event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      const pointer = canvas.getScenePoint(event.e);
      const cursorPoint = {
        x: roundCoordinate(pointer.x),
        y: roundCoordinate(pointer.y),
      };
      queueCursorSync({
        x: cursorPoint.x,
        y: cursorPoint.y,
      });

      if (activeToolRef.current !== 'pen' || !isLocalDrawingRef.current) {
        return;
      }

      const trail = localDrawingTrailRef.current;
      const previousPoint = trail[trail.length - 1];
      if (previousPoint) {
        const deltaX = cursorPoint.x - previousPoint.x;
        const deltaY = cursorPoint.y - previousPoint.y;
        if (Math.hypot(deltaX, deltaY) < DRAW_TRAIL_MIN_DISTANCE) {
          return;
        }
      }

      trail.push(cursorPoint);
      if (trail.length > DRAW_TRAIL_MAX_POINTS) {
        trail.splice(0, trail.length - DRAW_TRAIL_MAX_POINTS);
      }
      queueDrawingTrailSync();
    };

    const handlePenDrawStart = (event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (activeToolRef.current !== 'pen') {
        return;
      }

      const pointer = canvas.getScenePoint(event.e);
      const initialPoint = {
        x: roundCoordinate(pointer.x),
        y: roundCoordinate(pointer.y),
      };

      isLocalDrawingRef.current = true;
      localDrawingTrailRef.current = [initialPoint];
      lastDrawingSentAtRef.current = 0;
      flushDrawingTrail();
    };

    const handlePenDrawEnd = () => {
      if (!isLocalDrawingRef.current) {
        return;
      }

      isLocalDrawingRef.current = false;
      localDrawingTrailRef.current = [];

      if (drawingFlushTimerRef.current !== null) {
        window.clearTimeout(drawingFlushTimerRef.current);
        drawingFlushTimerRef.current = null;
      }

      void updatePresenceFields(boardId, localPresenceSessionId, {
        activity: {
          tool: activeToolRef.current,
          isDrawing: false,
          trail: [],
          updatedAt: Date.now(),
        },
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void updatePresence(boardId, localPresenceSessionId, {
          userId: syncUserId,
          sessionId: localPresenceSessionId,
          displayName: presenceIdentity.displayName,
          color: presenceIdentity.color,
          emoji: presenceIdentity.emoji,
          cursor: lastCursorSentRef.current ?? { x: 0, y: 0 },
          lastSeen: Date.now(),
          isActive: true,
          activity: {
            tool: activeToolRef.current,
            isDrawing: false,
            trail: [],
            updatedAt: Date.now(),
          },
        });
        return;
      }

      void updatePresenceFields(boardId, localPresenceSessionId, {
        isActive: false,
        activity: {
          tool: activeToolRef.current,
          isDrawing: false,
          trail: [],
          updatedAt: Date.now(),
        },
      });
    };

    canvas.on('mouse:move', handlePointerActivity);
    canvas.on('mouse:down', handlePointerActivity);
    canvas.on('mouse:up', handlePointerActivity);
    canvas.on('mouse:down', handlePenDrawStart);
    canvas.on('mouse:up', handlePenDrawEnd);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      canvas.off('mouse:move', handlePointerActivity);
      canvas.off('mouse:down', handlePointerActivity);
      canvas.off('mouse:up', handlePointerActivity);
      canvas.off('mouse:down', handlePenDrawStart);
      canvas.off('mouse:up', handlePenDrawEnd);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (cursorFlushTimerRef.current !== null) {
        window.clearTimeout(cursorFlushTimerRef.current);
        cursorFlushTimerRef.current = null;
      }
      if (drawingFlushTimerRef.current !== null) {
        window.clearTimeout(drawingFlushTimerRef.current);
        drawingFlushTimerRef.current = null;
      }

      void removePresence(boardId, localPresenceSessionId);
    };
  }, [
    boardId,
    canvas,
    localPresenceSessionId,
    presenceIdentity.color,
    presenceIdentity.displayName,
    presenceIdentity.emoji,
    syncUserId,
  ]);

  useEffect(() => {
    if (!canvas) {
      return;
    }

    const syncViewportTick = () => {
      const now = Date.now();
      if (now - viewportTickThrottleRef.current < 80) {
        return;
      }
      viewportTickThrottleRef.current = now;
      setViewportTick((value) => value + 1);
    };

    canvas.on('after:render', syncViewportTick);
    return () => {
      canvas.off('after:render', syncViewportTick);
    };
  }, [canvas]);

  void viewportTick;
  const remoteCursors = !canvas
    ? []
    : Object.values(presenceByUser)
      .filter((presence) => {
        const isLocalPresence =
          (presence.sessionId && presence.sessionId === localPresenceSessionId) ||
          (!presence.sessionId && presence.userId === syncUserId);
        if (!presence.isActive || isLocalPresence) {
          return false;
        }
        return Date.now() - presence.lastSeen <= REMOTE_CURSOR_TTL_MS;
      })
      .map((presence) => {
        const viewportPoint = toViewportCoordinates(canvas, presence.cursor);
        return {
          ...presence,
          viewportX: viewportPoint.x,
          viewportY: viewportPoint.y,
        };
      });

  const remoteDrawingTrails = !canvas
    ? []
    : Object.values(presenceByUser)
      .filter((presence) => {
        const isLocalPresence =
          (presence.sessionId && presence.sessionId === localPresenceSessionId) ||
          (!presence.sessionId && presence.userId === syncUserId);
        if (!presence.isActive || isLocalPresence) {
          return false;
        }
        if (Date.now() - presence.lastSeen > REMOTE_CURSOR_TTL_MS) {
          return false;
        }
        return Boolean(presence.activity?.isDrawing) &&
          Array.isArray(presence.activity?.trail) &&
          (presence.activity?.trail?.length ?? 0) > 1;
      })
      .map((presence) => {
        const points = (presence.activity?.trail ?? []).map((point) =>
          toViewportCoordinates(canvas, point)
        );
        return {
          presenceId: presence.sessionId ?? presence.userId,
          color: presence.color,
          points: points.map((point) => `${roundCoordinate(point.x)},${roundCoordinate(point.y)}`).join(' '),
        };
      });

  const deleteActiveSelection = React.useCallback(() => {
    if (!canvas || !canEditBoard) return;

    const activeObjects = canvas.getActiveObjects();
    if (!activeObjects || activeObjects.length === 0) {
      return;
    }

    activeObjects.forEach((object) => {
      if (isStickyObject(object)) {
        removeStickyNote(canvas, object);
        return;
      }
      canvas.remove(object);
    });

    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [canvas, canEditBoard]);

  const handleDelete = React.useCallback(() => {
    deleteActiveSelection();
  }, [deleteActiveSelection]);

  const resolveSelectedSticky = React.useCallback((): fabric.Rect | null => {
    if (!canvas || !selectedSticky) return null;

    const activeObject = canvas.getActiveObject();
    const activeContainer = getStickyContainerForObject(canvas, activeObject);
    if (activeContainer && getStickyObjectId(activeContainer) === selectedSticky.id) {
      return activeContainer;
    }

    return findStickyContainerById(canvas, selectedSticky.id);
  }, [canvas, selectedSticky]);

  const handleStickyEdit = React.useCallback(() => {
    if (!canvas || !canEditBoard) return;
    const stickyContainer = resolveSelectedSticky();
    if (!stickyContainer) return;
    focusStickyNoteEditor(canvas, stickyContainer, true);
  }, [canEditBoard, canvas, resolveSelectedSticky]);

  const handleStickyTypeKey = React.useCallback(
    (value: string) => {
      if (!canvas || !canEditBoard) return;
      const stickyContainer = resolveSelectedSticky();
      if (!stickyContainer) return;
      typeInStickyNote(canvas, stickyContainer, value);
    },
    [canEditBoard, canvas, resolveSelectedSticky]
  );

  const panViewportBy = React.useCallback(
    (deltaX: number, deltaY: number) => {
      if (!canvas) return;
      const vpt = canvas.viewportTransform;
      if (!vpt) return;

      vpt[4] += deltaX;
      vpt[5] += deltaY;
      canvas.requestRenderAll();
    },
    [canvas]
  );

  const panViewportByRef = useRef(panViewportBy);
  panViewportByRef.current = panViewportBy;

  const stopPanInertia = React.useCallback(() => {
    if (panInertiaFrameRef.current !== null) {
      cancelAnimationFrame(panInertiaFrameRef.current);
      panInertiaFrameRef.current = null;
    }
    panSamplesRef.current = [];
  }, []);

  const recordPanPosition = React.useCallback((clientX: number, clientY: number) => {
    const now = performance.now();
    const samples = panSamplesRef.current;
    samples.push({ x: clientX, y: clientY, t: now });
    while (samples.length > 0 && now - samples[0].t > VELOCITY_SAMPLE_WINDOW) {
      samples.shift();
    }
  }, []);

  const startPanInertia = React.useCallback(() => {
    const samples = panSamplesRef.current;
    if (samples.length < 2) {
      panSamplesRef.current = [];
      return;
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) {
      panSamplesRef.current = [];
      return;
    }

    // Convert to px per frame (~16.67ms at 60fps)
    let vx = ((last.x - first.x) / dt) * 16.67;
    let vy = ((last.y - first.y) / dt) * 16.67;
    panSamplesRef.current = [];

    if (Math.abs(vx) < PAN_VELOCITY_THRESHOLD && Math.abs(vy) < PAN_VELOCITY_THRESHOLD) {
      return;
    }

    const animate = () => {
      if (Math.abs(vx) < PAN_VELOCITY_THRESHOLD && Math.abs(vy) < PAN_VELOCITY_THRESHOLD) {
        panInertiaFrameRef.current = null;
        return;
      }

      panViewportByRef.current(vx, vy);
      vx *= PAN_FRICTION;
      vy *= PAN_FRICTION;
      panInertiaFrameRef.current = requestAnimationFrame(animate);
    };

    panInertiaFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const showImagePasteNotice = React.useCallback(
    (type: 'success' | 'error', message: string) => {
      if (imagePasteNoticeTimerRef.current) {
        window.clearTimeout(imagePasteNoticeTimerRef.current);
      }

      setImagePasteNotice({ type, message });
      imagePasteNoticeTimerRef.current = window.setTimeout(() => {
        setImagePasteNotice(null);
      }, IMAGE_PASTE_NOTICE_TIMEOUT_MS);
    },
    []
  );

  const openImageFilePicker = React.useCallback(() => {
    const inputElement = imageFileInputRef.current;
    if (!inputElement) return;

    inputElement.value = '';
    inputElement.click();
  }, []);

  const handleImageFileInputChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      event.target.value = '';

      if (!selectedFile) {
        return;
      }

      if (!canEditBoard) {
        showImagePasteNotice('error', 'This shared board is view-only');
        return;
      }

      if (!canvas) {
        showImagePasteNotice('error', 'Canvas is not ready yet');
        return;
      }

      const maxObjectsPerBoard = Number.isFinite(APP_CONFIG.maxObjectsPerBoard) &&
        APP_CONFIG.maxObjectsPerBoard > 0
        ? APP_CONFIG.maxObjectsPerBoard
        : 1000;

      if (canvas.getObjects().length >= maxObjectsPerBoard) {
        showImagePasteNotice('error', `Board limit reached (${maxObjectsPerBoard} objects)`);
        return;
      }

      const fileValidation = validateImageFile(selectedFile);
      if (!fileValidation.valid) {
        showImagePasteNotice('error', fileValidation.error ?? 'Invalid image file');
        return;
      }

      const dimensionValidation = await validateImageDimensions(selectedFile);
      if (!dimensionValidation.valid) {
        showImagePasteNotice(
          'error',
          dimensionValidation.error ?? 'Invalid image dimensions'
        );
        return;
      }

      const viewportCenter = getViewportCenterInScene(canvas);

      try {
        await addImageFromFile(canvas, actorId, selectedFile, {
          left: viewportCenter.x,
          top: viewportCenter.y,
          maxWidth: 700,
          maxHeight: 700,
        });
        showImagePasteNotice('success', 'Image uploaded');
      } catch {
        showImagePasteNotice('error', 'Failed to place image on canvas');
      }
    },
    [actorId, canEditBoard, canvas, showImagePasteNotice]
  );

  useEffect(() => {
    const handleImagePickerRequest = () => {
      if (!canEditBoard) {
        showImagePasteNotice('error', 'This shared board is view-only');
        return;
      }
      if (!canvas) {
        showImagePasteNotice('error', 'Canvas is not ready yet');
        return;
      }
      openImageFilePicker();
    };

    window.addEventListener(OPEN_IMAGE_PICKER_EVENT, handleImagePickerRequest);
    return () => {
      window.removeEventListener(OPEN_IMAGE_PICKER_EVENT, handleImagePickerRequest);
    };
  }, [canEditBoard, canvas, openImageFilePicker, showImagePasteNotice]);

  useEffect(() => {
    return () => {
      if (imagePasteNoticeTimerRef.current) {
        window.clearTimeout(imagePasteNoticeTimerRef.current);
      }
    };
  }, []);

  // Handle tool changes
  useEffect(() => {
    if (!canvas) return;
    const toolForBehavior = canEditBoard ? activeTool : 'hand';

    // Reset canvas interaction mode
    canvas.isDrawingMode = false;
    canvas.selection = canEditBoard;
    canvas.skipTargetFind = !canEditBoard;
    applyCanvasCursors(canvas, toolForBehavior);

    let cleanup = () => {};

    switch (toolForBehavior) {
      case 'select':
        // Default select mode
        canvas.selection = true;
        break;

      case 'hand': {
        // Hand tool for panning
        canvas.selection = false;
        canvas.skipTargetFind = true;

        let isHandPanning = false;
        let lastX = 0;
        let lastY = 0;

        const handleHandMouseDown = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
          isHandPanning = true;
          lastX = (e.e as any).clientX;
          lastY = (e.e as any).clientY;
          stopPanInertia();
          applyCanvasCursors(canvas, toolForBehavior, { grabbing: true });
        };

        const handleHandMouseMove = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
          if (isHandPanning) {
            const clientX = (e.e as any).clientX;
            const clientY = (e.e as any).clientY;
            const vpt = canvas.viewportTransform;
            if (vpt) {
              vpt[4] += clientX - lastX;
              vpt[5] += clientY - lastY;
              canvas.requestRenderAll();
              lastX = clientX;
              lastY = clientY;
            }
            recordPanPosition(clientX, clientY);
          }
        };

        const handleHandMouseUp = () => {
          isHandPanning = false;
          startPanInertia();
          applyCanvasCursors(canvas, toolForBehavior);
        };

        canvas.on('mouse:down', handleHandMouseDown);
        canvas.on('mouse:move', handleHandMouseMove);
        canvas.on('mouse:up', handleHandMouseUp);

        cleanup = () => {
          canvas.off('mouse:down', handleHandMouseDown);
          canvas.off('mouse:move', handleHandMouseMove);
          canvas.off('mouse:up', handleHandMouseUp);
        };
        break;
      }

      case 'pen': {
        // Enable free drawing mode (pressure simulation optional)
        canvas.isDrawingMode = true;
        canvas.selection = false;
        canvas.skipTargetFind = true;

        const brush = pressureSimulation
          ? new PressureBrush(canvas)
          : new fabric.PencilBrush(canvas);
        brush.color = strokeColor;
        brush.decimate = 0;
        if (brush instanceof PressureBrush) {
          brush.widthValue = strokeWidth;
        } else {
          brush.width = strokeWidth;
        }
        brush.strokeLineCap = 'round';
        brush.strokeLineJoin = 'round';
        canvas.freeDrawingBrush = brush;
        break;
      }

      case 'rectangle':
      case 'roundedRectangle':
      case 'circle':
      case 'diamond':
      case 'triangle':
      case 'star':
      case 'hexagon':
      case 'parallelogram':
      case 'blockArrow':
      case 'line':
      case 'arrow':
      case 'elbowArrow':
      case 'curvedArrow': {
        const shapeTool: ShapeToolType = toolForBehavior as ShapeToolType;
        // Shape mode should always draw, even when starting over an existing object.
        canvas.selection = false;
        canvas.skipTargetFind = true;

        let isDraggingShape = false;
        let dragStart: { x: number; y: number } | null = null;
        let activeShape: ReturnType<typeof createShapeForDrag> | null = null;

        const handleShapeMouseDown = (
          event: fabric.TPointerEventInfo<fabric.TPointerEvent>
        ) => {
          const pointerEvent = event.e as MouseEvent;
          if (pointerEvent.button !== undefined && pointerEvent.button !== 0) {
            return;
          }

          const pointer = canvas.getScenePoint(event.e);
          dragStart = { x: pointer.x, y: pointer.y };
          activeShape = createShapeForDrag(canvas, actorId, shapeTool, dragStart, {
            stroke: strokeColor,
            fill: isConnectorShapeTool(shapeTool) ? undefined : fillColor,
            strokeWidth,
          });
          isDraggingShape = true;
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        };

        const handleShapeMouseMove = (
          event: fabric.TPointerEventInfo<fabric.TPointerEvent>
        ) => {
          if (!isDraggingShape || !activeShape || !dragStart) {
            return;
          }

          const pointer = canvas.getScenePoint(event.e);
          updateDraggedShape(
            activeShape,
            shapeTool,
            dragStart,
            { x: pointer.x, y: pointer.y },
            { perfect: Boolean((event.e as MouseEvent).shiftKey) }
          );
          canvas.requestRenderAll();
        };

        const handleShapeMouseUp = (
          event: fabric.TPointerEventInfo<fabric.TPointerEvent>
        ) => {
          if (!isDraggingShape || !activeShape || !dragStart) {
            return;
          }

          const pointer = canvas.getScenePoint(event.e);
          finalizeDraggedShape(activeShape, shapeTool, dragStart, {
            x: pointer.x,
            y: pointer.y,
          }, {
            perfect: Boolean((event.e as MouseEvent).shiftKey),
          });
          delete (activeShape as DraftShapeObject)[DRAFT_SHAPE_FLAG];
          activeShape.set({
            selectable: true,
            evented: true,
          });
          activeShape.setCoords();
          canvas.setActiveObject(activeShape);
          enqueueObjectUpsertMutation(activeShape);
          scheduleCanvasPersist();
          canvas.requestRenderAll();
          isDraggingShape = false;
          dragStart = null;
          activeShape = null;
        };

        canvas.on('mouse:down', handleShapeMouseDown);
        canvas.on('mouse:move', handleShapeMouseMove);
        canvas.on('mouse:up', handleShapeMouseUp);

        cleanup = () => {
          canvas.off('mouse:down', handleShapeMouseDown);
          canvas.off('mouse:move', handleShapeMouseMove);
          canvas.off('mouse:up', handleShapeMouseUp);
        };
        break;
      }

      case 'text': {
        canvas.selection = false;
        canvas.skipTargetFind = false;
        const handleTextMouseDown = (
          event: fabric.TPointerEventInfo<fabric.TPointerEvent>
        ) => {
          const pointerEvent = event.e as MouseEvent;
          if (pointerEvent.button !== undefined && pointerEvent.button !== 0) {
            return;
          }

          if (event.target instanceof fabric.IText) {
            canvas.setActiveObject(event.target);
            event.target.enterEditing();
            event.target.selectAll();
            canvas.requestRenderAll();
            return;
          }

          if (event.target) {
            canvas.setActiveObject(event.target);
            canvas.requestRenderAll();
            return;
          }

          const pointer = canvas.getScenePoint(event.e);
          addText(canvas, actorId, 'Text', {
            left: pointer.x,
            top: pointer.y,
            fill: strokeColor,
            autoEdit: true,
            selectAll: true,
          });
          setActiveTool('select');
        };
        canvas.on('mouse:down', handleTextMouseDown);
        cleanup = () => {
          canvas.off('mouse:down', handleTextMouseDown);
        };
        break;
      }

      case 'sticky': {
        canvas.selection = false;
        const handleStickyMouseDown = (
          event: fabric.TPointerEventInfo<fabric.TPointerEvent>
        ) => {
          const pointerEvent = event.e as MouseEvent;
          if (pointerEvent.button !== undefined && pointerEvent.button !== 0) {
            return;
          }

          const pointer = canvas.getScenePoint(event.e);
          addStickyNote(canvas, actorId, {
            left: pointer.x - STICKY_DEFAULT_WIDTH / 2,
            top: pointer.y - STICKY_DEFAULT_HEIGHT / 2,
            color: stickyPlacementColor,
            autoEdit: true,
          });
          setActiveTool('select');
        };
        canvas.on('mouse:down', handleStickyMouseDown);
        cleanup = () => {
          canvas.off('mouse:down', handleStickyMouseDown);
        };
        break;
      }

      case 'eraser':
        canvas.selection = true;
        // Eraser will use the delete key functionality
        break;
    }

    return () => {
      cleanup();
      canvas.isDrawingMode = false;
      canvas.skipTargetFind = false;
      applyCanvasCursors(canvas, 'select');
    };
  }, [
    activeTool,
    actorId,
    canEditBoard,
    canvas,
    strokeColor,
    fillColor,
    strokeWidth,
    pressureSimulation,
    enqueueObjectUpsertMutation,
    scheduleCanvasPersist,
    setActiveTool,
    stickyPlacementColor,
    stopPanInertia,
    recordPanPosition,
    startPanInertia,
  ]);

  // Update brush settings when color/width changes
  useEffect(() => {
    if (!canEditBoard || !canvas || activeTool !== 'pen' || !canvas.freeDrawingBrush) return;

    canvas.freeDrawingBrush.color = strokeColor;

    // Use custom setter for PressureBrush
    if (canvas.freeDrawingBrush instanceof PressureBrush) {
      (canvas.freeDrawingBrush as PressureBrush).widthValue = strokeWidth;
    } else {
      canvas.freeDrawingBrush.width = strokeWidth;
    }
  }, [canEditBoard, canvas, activeTool, strokeColor, strokeWidth]);

  // Track selection state for contextual delete button
  useEffect(() => {
    if (!canvas) return;

    const updateSelection = () => {
      const activeObjects = canvas.getActiveObjects();
      const hasActiveSelection = Boolean(activeObjects && activeObjects.length > 0);
      setHasSelection(hasActiveSelection);

      if (!hasActiveSelection || !activeObjects || activeObjects.length !== 1) {
        setSelectedSticky(null);
        return;
      }

      const selectedObject = activeObjects[0];
      const stickyContainer = getStickyContainerForObject(canvas, selectedObject);
      if (!stickyContainer) {
        setSelectedSticky(null);
        return;
      }

      if (selectedObject !== stickyContainer) {
        canvas.setActiveObject(stickyContainer);
        canvas.requestRenderAll();
        return;
      }

      const stickyId = getStickyObjectId(stickyContainer);
      if (!stickyId) {
        setSelectedSticky(null);
        return;
      }
      setSelectedSticky({ id: stickyId });
    };

    canvas.on('selection:created', updateSelection);
    canvas.on('selection:updated', updateSelection);
    canvas.on('selection:cleared', updateSelection);
    canvas.on('object:removed', updateSelection);
    canvas.on('object:modified', updateSelection);

    return () => {
      canvas.off('selection:created', updateSelection);
      canvas.off('selection:updated', updateSelection);
      canvas.off('selection:cleared', updateSelection);
      canvas.off('object:removed', updateSelection);
      canvas.off('object:modified', updateSelection);
    };
  }, [canvas]);

  // Handle delete key - delete selected objects
  useEffect(() => {
    if (!canEditBoard) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isTextInputFocused()) {
        event.preventDefault();
        deleteActiveSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canEditBoard, deleteActiveSelection]);

  // Handle clipboard image paste
  useEffect(() => {
    if (!canvas || !canEditBoard) return;

    const handlePaste = async (event: ClipboardEvent) => {
      if (isTextInputFocused()) {
        return;
      }

      const imageFiles = getClipboardImageFiles(event);
      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();

      const maxImagesPerPaste = Number.isFinite(APP_CONFIG.maxClipboardImagesPerPaste) &&
        APP_CONFIG.maxClipboardImagesPerPaste > 0
        ? APP_CONFIG.maxClipboardImagesPerPaste
        : 3;
      const maxObjectsPerBoard = Number.isFinite(APP_CONFIG.maxObjectsPerBoard) &&
        APP_CONFIG.maxObjectsPerBoard > 0
        ? APP_CONFIG.maxObjectsPerBoard
        : 1000;

      const filesToPaste = imageFiles.slice(0, maxImagesPerPaste);
      const skippedForLimit = imageFiles.length - filesToPaste.length;
      const validationErrors: string[] = [];
      const viewportCenter = getViewportCenterInScene(canvas);
      let availableBoardSlots = Math.max(0, maxObjectsPerBoard - canvas.getObjects().length);
      let insertedCount = 0;

      for (const [index, file] of filesToPaste.entries()) {
        if (availableBoardSlots <= 0) {
          validationErrors.push(`Board limit reached (${maxObjectsPerBoard} objects)`);
          break;
        }

        const imageLabel = file.name || `Clipboard image ${index + 1}`;
        const fileValidation = validateImageFile(file);
        if (!fileValidation.valid) {
          validationErrors.push(`${imageLabel}: ${fileValidation.error ?? 'Invalid image file'}`);
          continue;
        }

        const dimensionValidation = await validateImageDimensions(file);
        if (!dimensionValidation.valid) {
          validationErrors.push(
            `${imageLabel}: ${dimensionValidation.error ?? 'Invalid image dimensions'}`
          );
          continue;
        }

        try {
          const placementOffset = insertedCount * IMAGE_PASTE_OFFSET;
          await addImageFromFile(canvas, actorId, file, {
            left: viewportCenter.x + placementOffset,
            top: viewportCenter.y + placementOffset,
            maxWidth: 700,
            maxHeight: 700,
          });
          availableBoardSlots -= 1;
          insertedCount += 1;
        } catch {
          validationErrors.push(`${imageLabel}: Failed to place image on canvas`);
        }
      }

      if (skippedForLimit > 0) {
        validationErrors.push(
          `Only ${maxImagesPerPaste} image${maxImagesPerPaste === 1 ? '' : 's'} can be pasted at once`
        );
      }

      if (insertedCount > 0) {
        setActiveTool('select');

        if (validationErrors.length > 0) {
          const extraCount = validationErrors.length - 1;
          const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
          showImagePasteNotice(
            'error',
            `Pasted ${insertedCount} image${insertedCount === 1 ? '' : 's'}. ${validationErrors[0]}${suffix}`
          );
        } else {
          showImagePasteNotice(
            'success',
            `${insertedCount} image${insertedCount === 1 ? '' : 's'} pasted`
          );
        }
        return;
      }

      if (validationErrors.length > 0) {
        const extraCount = validationErrors.length - 1;
        const suffix = extraCount > 0 ? ` (+${extraCount} more)` : '';
        showImagePasteNotice('error', `${validationErrors[0]}${suffix}`);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [actorId, canEditBoard, canvas, setActiveTool, showImagePasteNotice]);

  // Handle middle mouse button panning
  useEffect(() => {
    if (!canvas || !containerRef.current) return;

    const handleMiddleMouseDown = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      // Check if middle mouse button (button 1)
      if ((e.e as any).button === 1) {
        e.e.preventDefault();
        middleMousePanningRef.current = true;
        lastPosXRef.current = (e.e as any).clientX;
        lastPosYRef.current = (e.e as any).clientY;
        canvas.selection = false;
        stopPanInertia();
        applyCanvasCursors(canvas, effectiveTool, { grabbing: true });
        if (containerRef.current) {
          containerRef.current.classList.add(styles.panning);
        }
      }
    };

    const handleMiddleMouseMove = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (middleMousePanningRef.current) {
        const clientX = (e.e as any).clientX;
        const clientY = (e.e as any).clientY;
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += clientX - lastPosXRef.current;
          vpt[5] += clientY - lastPosYRef.current;
          canvas.requestRenderAll();
          lastPosXRef.current = clientX;
          lastPosYRef.current = clientY;
        }
        recordPanPosition(clientX, clientY);
      }
    };

    const handleMiddleMouseUp = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if ((e.e as any).button === 1 && middleMousePanningRef.current) {
        middleMousePanningRef.current = false;
        startPanInertia();
        canvas.selection = canEditBoard && shouldEnableSelection(activeTool);
        if (spacebarPressedRef.current) {
          applyCanvasCursors(canvas, effectiveTool, { panReady: true });
        } else {
          applyCanvasCursors(canvas, effectiveTool);
        }
        if (containerRef.current) {
          containerRef.current.classList.remove(styles.panning);
        }
      }
    };

    // Prevent default middle mouse behavior (like auto-scroll)
    const preventMiddleMouseDefault = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    };

    canvas.on('mouse:down', handleMiddleMouseDown);
    canvas.on('mouse:move', handleMiddleMouseMove);
    canvas.on('mouse:up', handleMiddleMouseUp);

    const canvasElement = canvas.getElement();
    canvasElement.addEventListener('mousedown', preventMiddleMouseDefault);

    return () => {
      canvas.off('mouse:down', handleMiddleMouseDown);
      canvas.off('mouse:move', handleMiddleMouseMove);
      canvas.off('mouse:up', handleMiddleMouseUp);
      canvasElement.removeEventListener('mousedown', preventMiddleMouseDefault);
    };
  }, [canvas, canEditBoard, activeTool, effectiveTool, stopPanInertia, recordPanPosition, startPanInertia]);

  // Handle pan with spacebar + mouse drag
  useEffect(() => {
    if (!canvas || !containerRef.current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        spacebarPressedRef.current = true;
        applyCanvasCursors(canvas, effectiveTool, { panReady: true });
        if (containerRef.current) {
          containerRef.current.classList.add(styles.panning);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacebarPressedRef.current = false;
        isPanningRef.current = false;
        applyCanvasCursors(canvas, effectiveTool);
        if (containerRef.current) {
          containerRef.current.classList.remove(styles.panning);
        }
      }
    };

    const handleMouseDown = (event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (spacebarPressedRef.current) {
        isPanningRef.current = true;
        canvas.selection = false;
        lastPosXRef.current = (event.e as any).clientX;
        lastPosYRef.current = (event.e as any).clientY;
        stopPanInertia();
        applyCanvasCursors(canvas, effectiveTool, { grabbing: true });
      }
    };

    const handleMouseMove = (event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (isPanningRef.current && spacebarPressedRef.current) {
        const e = event.e;
        const clientX = (e as any).clientX;
        const clientY = (e as any).clientY;
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += clientX - lastPosXRef.current;
          vpt[5] += clientY - lastPosYRef.current;
          canvas.requestRenderAll();
          lastPosXRef.current = clientX;
          lastPosYRef.current = clientY;
        }
        recordPanPosition(clientX, clientY);
      }
    };

    const handleMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        startPanInertia();
        canvas.selection = canEditBoard && shouldEnableSelection(activeTool);
        if (spacebarPressedRef.current) {
          applyCanvasCursors(canvas, effectiveTool, { panReady: true });
        } else {
          applyCanvasCursors(canvas, effectiveTool);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [canvas, canEditBoard, activeTool, effectiveTool, stopPanInertia, recordPanPosition, startPanInertia]);

  // Handle Cmd/Ctrl + left-click drag panning
  useEffect(() => {
    if (!canvas || !containerRef.current) return;

    const handleModifierMouseDown = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      const evt = e.e as any;
      if ((evt.metaKey || evt.ctrlKey) && evt.button === 0) {
        e.e.preventDefault();
        modifierPanningRef.current = true;
        lastPosXRef.current = evt.clientX;
        lastPosYRef.current = evt.clientY;
        canvas.selection = false;
        stopPanInertia();
        applyCanvasCursors(canvas, effectiveTool, { grabbing: true });
        if (containerRef.current) {
          containerRef.current.classList.add(styles.panning);
        }
      }
    };

    const handleModifierMouseMove = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (modifierPanningRef.current) {
        const clientX = (e.e as any).clientX;
        const clientY = (e.e as any).clientY;
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += clientX - lastPosXRef.current;
          vpt[5] += clientY - lastPosYRef.current;
          canvas.requestRenderAll();
          lastPosXRef.current = clientX;
          lastPosYRef.current = clientY;
        }
        recordPanPosition(clientX, clientY);
      }
    };

    const handleModifierMouseUp = () => {
      if (modifierPanningRef.current) {
        modifierPanningRef.current = false;
        startPanInertia();
        canvas.selection = canEditBoard && shouldEnableSelection(activeTool);
        applyCanvasCursors(canvas, effectiveTool);
        if (containerRef.current) {
          containerRef.current.classList.remove(styles.panning);
        }
      }
    };

    canvas.on('mouse:down', handleModifierMouseDown);
    canvas.on('mouse:move', handleModifierMouseMove);
    canvas.on('mouse:up', handleModifierMouseUp);

    return () => {
      canvas.off('mouse:down', handleModifierMouseDown);
      canvas.off('mouse:move', handleModifierMouseMove);
      canvas.off('mouse:up', handleModifierMouseUp);
    };
  }, [canvas, canEditBoard, activeTool, effectiveTool, stopPanInertia, recordPanPosition, startPanInertia]);

  // Handle trackpad/mouse wheel zoom (Cmd/Ctrl + scroll pans instead)
  useEffect(() => {
    if (!canvas) return;

    const handleWheel = (opt: fabric.TPointerEventInfo<WheelEvent>) => {
      const event = opt.e;

      event.preventDefault();
      event.stopPropagation();

      // Cmd/Ctrl + scroll/swipe → pan instead of zoom
      if (event.metaKey || event.ctrlKey) {
        panViewportBy(-event.deltaX, -event.deltaY);
        return;
      }

      const delta = event.deltaY;
      let newZoom = canvas.getZoom();
      newZoom *= 0.999 ** delta;

      if (newZoom > MAX_ZOOM) newZoom = MAX_ZOOM;
      if (newZoom < MIN_ZOOM) newZoom = MIN_ZOOM;

      const point = new fabric.Point(event.offsetX, event.offsetY);
      canvas.zoomToPoint(point, newZoom);
      setZoom(newZoom);
    };

    canvas.on('mouse:wheel', handleWheel);

    return () => {
      canvas.off('mouse:wheel', handleWheel);
    };
  }, [canvas, setZoom, panViewportBy]);

  // Handle Safari trackpad pinch gestures
  useEffect(() => {
    if (!canvas || !containerRef.current) return;

    type GestureEventLike = Event & {
      scale?: number;
      clientX?: number;
      clientY?: number;
    };

    const element = containerRef.current;

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as GestureEventLike;
      if (typeof gestureEvent.scale !== 'number') return;
      event.preventDefault();
      gestureScaleRef.current = gestureEvent.scale;
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as GestureEventLike;
      if (typeof gestureEvent.scale !== 'number') return;

      event.preventDefault();
      const previousScale = gestureScaleRef.current || gestureEvent.scale;
      const zoomFactor = gestureEvent.scale / previousScale;
      gestureScaleRef.current = gestureEvent.scale;

      let newZoom = canvas.getZoom() * zoomFactor;
      if (newZoom > MAX_ZOOM) newZoom = MAX_ZOOM;
      if (newZoom < MIN_ZOOM) newZoom = MIN_ZOOM;

      const rect = element.getBoundingClientRect();
      const x = typeof gestureEvent.clientX === 'number'
        ? gestureEvent.clientX - rect.left
        : rect.width / 2;
      const y = typeof gestureEvent.clientY === 'number'
        ? gestureEvent.clientY - rect.top
        : rect.height / 2;

      canvas.zoomToPoint(new fabric.Point(x, y), newZoom);
      setZoom(newZoom);
    };

    const handleGestureEnd = () => {
      gestureScaleRef.current = 1;
    };

    element.addEventListener('gesturestart', handleGestureStart, { passive: false });
    element.addEventListener('gesturechange', handleGestureChange, { passive: false });
    element.addEventListener('gestureend', handleGestureEnd);

    return () => {
      element.removeEventListener('gesturestart', handleGestureStart);
      element.removeEventListener('gesturechange', handleGestureChange);
      element.removeEventListener('gestureend', handleGestureEnd);
    };
  }, [canvas, setZoom]);

  // Handle keyboard shortcuts (undo/redo, zoom, and tool selection)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      // Don't trigger shortcuts when typing in inputs
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      // Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
      if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
        if (!canEditBoard) {
          return;
        }
        event.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y (Windows/Linux) or Cmd+Shift+Z (Mac)
      if (
        ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'z') ||
        ((event.ctrlKey || event.metaKey) && key === 'y')
      ) {
        if (!canEditBoard) {
          return;
        }
        event.preventDefault();
        redo();
        return;
      }

      // Zoom in: Ctrl/Cmd + Plus/Equal (including numpad)
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')
      ) {
        event.preventDefault();
        if (!canvas) return;
        const newZoom = Math.min(zoom * 1.2, MAX_ZOOM);
        setZoom(newZoom);
        canvas.setZoom(newZoom);
        canvas.renderAll();
        return;
      }

      // Zoom out: Ctrl/Cmd + Minus (including numpad)
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract')
      ) {
        event.preventDefault();
        if (!canvas) return;
        const newZoom = Math.max(zoom / 1.2, MIN_ZOOM);
        setZoom(newZoom);
        canvas.setZoom(newZoom);
        canvas.renderAll();
        return;
      }

      // Reset zoom: Ctrl/Cmd + 0 (including numpad)
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === '0' || event.code === 'Numpad0')
      ) {
        event.preventDefault();
        if (!canvas) return;
        setZoom(1);
        canvas.setZoom(1);
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.renderAll();
        return;
      }

      // Typing with a sticky selected should start editing and replace placeholder text.
      if (selectedSticky && isPlainTypingKey(event)) {
        if (!canEditBoard) {
          return;
        }
        event.preventDefault();
        handleStickyTypeKey(event.key);
        return;
      }

      // Edit selected sticky note: Enter
      if (!event.ctrlKey && !event.metaKey && event.key === 'Enter' && selectedSticky) {
        if (!canEditBoard) {
          return;
        }
        event.preventDefault();
        handleStickyEdit();
        return;
      }

      // Arrow keys pan the viewport (Shift for faster pan)
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
        const panStep = event.shiftKey ? KEYBOARD_PAN_STEP_FAST : KEYBOARD_PAN_STEP;

        switch (event.key) {
          case 'ArrowUp':
            panViewportBy(0, panStep);
            break;
          case 'ArrowDown':
            panViewportBy(0, -panStep);
            break;
          case 'ArrowLeft':
            panViewportBy(panStep, 0);
            break;
          case 'ArrowRight':
            panViewportBy(-panStep, 0);
            break;
        }
        return;
      }

      // Tool shortcuts (only when not holding Ctrl/Cmd)
      if (!event.ctrlKey && !event.metaKey) {
        if (!canEditBoard) {
          if (event.key.toLowerCase() === 'h') {
            event.preventDefault();
            setActiveTool('hand');
          }
          return;
        }

        switch (event.key.toLowerCase()) {
          case 'v':
            event.preventDefault();
            setActiveTool('select');
            break;
          case 'h':
            event.preventDefault();
            setActiveTool('hand');
            break;
          case 'p':
            event.preventDefault();
            setActiveTool('pen');
            break;
          case 't':
            event.preventDefault();
            setActiveTool('text');
            break;
          case 'r':
            event.preventDefault();
            setActiveTool('rectangle');
            break;
          case 'c':
            event.preventDefault();
            setActiveTool('circle');
            break;
          case 'l':
            event.preventDefault();
            setActiveTool('line');
            break;
          case 'a':
            event.preventDefault();
            setActiveTool('arrow');
            break;
          case 'd':
            event.preventDefault();
            setActiveTool('diamond');
            break;
          case 'n':
            event.preventDefault();
            setActiveTool(activeTool === 'sticky' ? 'select' : 'sticky');
            break;
          case 'i':
            event.preventDefault();
            window.dispatchEvent(new Event(OPEN_IMAGE_PICKER_EVENT));
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    undo,
    redo,
    setActiveTool,
    activeTool,
    canvas,
    zoom,
    setZoom,
    panViewportBy,
    selectedSticky,
    handleStickyEdit,
    handleStickyTypeKey,
    canEditBoard,
  ]);

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas ref={canvasRef} />
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className={styles.hiddenFileInput}
        onChange={handleImageFileInputChange}
      />
      <Link
        href="/"
        className={styles.backButton}
        title="Back to boards"
        aria-label="Back to boards"
      >
        ←
      </Link>

      {!canvasHydrated && showHydrationOverlay && (
        <div className={styles.hydrationOverlay}>
          <div className={styles.hydrationBadge} role="status" aria-live="polite">
            Syncing board...
          </div>
        </div>
      )}

      {canEditBoard && activeTool === 'sticky' && (
        <div className={styles.modeHint} role="status" aria-live="polite">
          Pick a color, then click anywhere to place a sticky note.
        </div>
      )}

      {canEditBoard && activeTool === 'sticky' && (
        <div className={styles.stickyPlacementPalette} role="region" aria-label="Sticky note colors">
          <div className={styles.stickyPlacementGrid}>
            {STICKY_NOTE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`${styles.stickyPlacementColor} ${
                  stickyPlacementColor.toLowerCase() === color.toLowerCase()
                    ? styles.stickyPlacementColorActive
                    : ''
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setStickyPlacementColor(color)}
                title={`Sticky color ${color}`}
                aria-label={`Sticky color ${color}`}
              />
            ))}
          </div>
        </div>
      )}

      {remoteDrawingTrails.length > 0 && (
        <svg className={styles.remoteTrailLayer} aria-hidden="true">
          {remoteDrawingTrails.map((trail) => (
            <polyline
              key={trail.presenceId}
              points={trail.points}
              fill="none"
              stroke={trail.color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.92}
            />
          ))}
        </svg>
      )}

      {remoteCursors.map((presence) => (
        <div
          key={presence.sessionId ?? presence.userId}
          className={styles.remoteCursor}
          style={{
            left: `${presence.viewportX}px`,
            top: `${presence.viewportY}px`,
            '--remote-cursor-color': presence.color,
          } as React.CSSProperties}
          aria-label={`${presence.displayName} cursor`}
        >
          <span className={styles.remoteCursorPointer} aria-hidden="true" />
          <span className={styles.remoteCursorBadge}>
            <span>{presence.emoji}</span>
            <span>{presence.displayName}</span>
          </span>
        </div>
      ))}

      {imagePasteNotice && (
        <div
          className={`${styles.pasteNotice} ${
            imagePasteNotice.type === 'error' ? styles.pasteNoticeError : styles.pasteNoticeSuccess
          }`}
          role="status"
          aria-live="polite"
        >
          {imagePasteNotice.message}
        </div>
      )}

      {/* Contextual delete button */}
      {canEditBoard && hasSelection && (
        <button
          className={styles.deleteButton}
          onClick={handleDelete}
          title="Delete (Del)"
        >
          🗑️ Delete
        </button>
      )}
    </div>
  );
}
