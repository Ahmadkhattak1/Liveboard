'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { ToolType } from '@/types/canvas';
import { DEFAULT_STROKE_COLOR, DEFAULT_FILL_COLOR } from '@/lib/constants/colors';
import { DEFAULT_STROKE_WIDTH } from '@/lib/constants/tools';
import { serializeCanvas, stringifyCanvasState } from '@/lib/canvas/serialization';

interface CanvasContextType {
  canvas: fabric.Canvas | null;
  setCanvas: (canvas: fabric.Canvas | null) => void;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  fillColor: string;
  setFillColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  pressureSimulation: boolean;
  setPressureSimulation: (enabled: boolean) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const HISTORY_DEBOUNCE_MS = 140;
const HISTORY_LIMIT = 120;

function serializeCanvasState(canvas: fabric.Canvas): string {
  // When objects are in an ActiveSelection their left/top are group-relative.
  // Temporarily discard the selection so we capture absolute coordinates.
  const activeObject = canvas.getActiveObject();
  const selectedObjects =
    activeObject instanceof fabric.ActiveSelection
      ? [...canvas.getActiveObjects()]
      : [];
  if (selectedObjects.length > 0) {
    canvas.discardActiveObject();
  }

  const state = stringifyCanvasState(serializeCanvas(canvas));

  // Restore the selection.
  if (selectedObjects.length > 0) {
    const sel = new fabric.ActiveSelection(selectedObjects, { canvas });
    canvas.setActiveObject(sel);
  }

  return state;
}

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [strokeColor, setStrokeColor] = useState(DEFAULT_STROKE_COLOR);
  const [fillColor, setFillColor] = useState(DEFAULT_FILL_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [pressureSimulation, setPressureSimulation] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const canUndo = undoStack.length > 1;
  const canRedo = redoStack.length > 0;
  const snapshotTimerRef = useRef<number | null>(null);
  const isRestoringHistoryRef = useRef(false);
  const lastSnapshotRef = useRef<string | null>(null);

  const clearSnapshotTimer = React.useCallback(() => {
    if (snapshotTimerRef.current !== null) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearSnapshotTimer();
    };
  }, [clearSnapshotTimer]);

  useEffect(() => {
    if (!canvas) return;

    const initialSnapshot = serializeCanvasState(canvas);
    lastSnapshotRef.current = initialSnapshot;
    setUndoStack([initialSnapshot]);
    setRedoStack([]);

    const scheduleSnapshot = () => {
      if (isRestoringHistoryRef.current) {
        return;
      }

      clearSnapshotTimer();
      snapshotTimerRef.current = window.setTimeout(() => {
        snapshotTimerRef.current = null;
        if (isRestoringHistoryRef.current) {
          return;
        }

        const nextSnapshot = serializeCanvasState(canvas);
        if (lastSnapshotRef.current === nextSnapshot) {
          return;
        }

        setUndoStack((prev) => {
          const next = [...prev, nextSnapshot];
          if (next.length > HISTORY_LIMIT) {
            return next.slice(next.length - HISTORY_LIMIT);
          }
          return next;
        });
        setRedoStack([]);
        lastSnapshotRef.current = nextSnapshot;
      }, HISTORY_DEBOUNCE_MS);
    };

    canvas.on('after:render', scheduleSnapshot);

    return () => {
      clearSnapshotTimer();
      canvas.off('after:render', scheduleSnapshot);
    };
  }, [canvas, clearSnapshotTimer]);

  // Undo function
  const undo = React.useCallback(() => {
    if (!canvas || isRestoringHistoryRef.current || undoStack.length <= 1) return;

    clearSnapshotTimer();
    isRestoringHistoryRef.current = true;

    const currentState = undoStack[undoStack.length - 1];
    const previousState = undoStack[undoStack.length - 2];

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentState]);

    canvas.loadFromJSON(previousState).then(() => {
      canvas.discardActiveObject();
      canvas.renderAll();
      lastSnapshotRef.current = previousState;
    }).finally(() => {
      isRestoringHistoryRef.current = false;
    });
  }, [canvas, undoStack, clearSnapshotTimer]);

  // Redo function
  const redo = React.useCallback(() => {
    if (!canvas || isRestoringHistoryRef.current || redoStack.length === 0) return;

    clearSnapshotTimer();
    isRestoringHistoryRef.current = true;

    const nextState = redoStack[redoStack.length - 1];

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => {
      const next = [...prev, nextState];
      if (next.length > HISTORY_LIMIT) {
        return next.slice(next.length - HISTORY_LIMIT);
      }
      return next;
    });

    canvas.loadFromJSON(nextState).then(() => {
      canvas.discardActiveObject();
      canvas.renderAll();
      lastSnapshotRef.current = nextState;
    }).finally(() => {
      isRestoringHistoryRef.current = false;
    });
  }, [canvas, redoStack, clearSnapshotTimer]);

  return (
    <CanvasContext.Provider
      value={{
        canvas,
        setCanvas,
        activeTool,
        setActiveTool,
        strokeColor,
        setStrokeColor,
        fillColor,
        setFillColor,
        strokeWidth,
        setStrokeWidth,
        pressureSimulation,
        setPressureSimulation,
        zoom,
        setZoom,
        undo,
        redo,
        canUndo,
        canRedo,
      }}
    >
      {children}
    </CanvasContext.Provider>
  );
}

export function useCanvas() {
  const context = useContext(CanvasContext);
  if (context === undefined) {
    throw new Error('useCanvas must be used within a CanvasProvider');
  }
  return context;
}
