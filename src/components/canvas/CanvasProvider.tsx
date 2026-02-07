'use client';

import React, { createContext, useContext, useState, useRef } from 'react';
import * as fabric from 'fabric';
import { ToolType } from '@/types/canvas';
import { DEFAULT_STROKE_COLOR, DEFAULT_FILL_COLOR } from '@/lib/constants/colors';
import { DEFAULT_STROKE_WIDTH } from '@/lib/constants/tools';

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
  zoom: number;
  setZoom: (zoom: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [strokeColor, setStrokeColor] = useState(DEFAULT_STROKE_COLOR);
  const [fillColor, setFillColor] = useState(DEFAULT_FILL_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [zoom, setZoom] = useState(1);

  // Undo/Redo state
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // Save canvas state to undo stack
  const saveState = React.useCallback(() => {
    if (!canvas) return;

    const json = JSON.stringify(canvas.toJSON());
    setUndoStack((prev) => [...prev, json]);
    setRedoStack([]); // Clear redo stack on new action
  }, [canvas]);

  // Undo function
  const undo = React.useCallback(() => {
    if (!canvas || undoStack.length === 0) return;

    const currentState = JSON.stringify(canvas.toJSON());
    const previousState = undoStack[undoStack.length - 1];

    setRedoStack((prev) => [currentState, ...prev]);
    setUndoStack((prev) => prev.slice(0, -1));

    canvas.loadFromJSON(previousState).then(() => {
      canvas.renderAll();
    });
  }, [canvas, undoStack]);

  // Redo function
  const redo = React.useCallback(() => {
    if (!canvas || redoStack.length === 0) return;

    const currentState = JSON.stringify(canvas.toJSON());
    const nextState = redoStack[0];

    setUndoStack((prev) => [...prev, currentState]);
    setRedoStack((prev) => prev.slice(1));

    canvas.loadFromJSON(nextState).then(() => {
      canvas.renderAll();
    });
  }, [canvas, redoStack]);

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
