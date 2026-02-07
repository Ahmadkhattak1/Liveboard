export type ToolType =
  | 'select'
  | 'hand'
  | 'pen'
  | 'text'
  | 'rectangle'
  | 'roundedRectangle'
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'star'
  | 'hexagon'
  | 'parallelogram'
  | 'blockArrow'
  | 'line'
  | 'arrow'
  | 'elbowArrow'
  | 'curvedArrow'
  | 'image'
  | 'sticky'
  | 'eraser';

export interface Tool {
  id: ToolType;
  name: string;
  emoji: string;
  shortcut: string;
  color?: string;
}

export interface DrawingState {
  activeTool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize: number;
  opacity: number;
}

export interface CanvasConfig {
  width: number;
  height: number;
  backgroundColor: string;
}

export interface CanvasControls {
  zoom: number;
  pan: {
    x: number;
    y: number;
  };
}

// Custom Fabric.js object with additional properties
// Will properly integrate with Fabric.js in Phase 2
export interface CustomFabricObject {
  id?: string;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  updatedBy?: string;
  [key: string]: any;
}

export interface Point {
  x: number;
  y: number;
}

export type CanvasEventType =
  | 'object:added'
  | 'object:modified'
  | 'object:removed'
  | 'object:moving'
  | 'object:scaling'
  | 'object:rotating'
  | 'selection:created'
  | 'selection:updated'
  | 'selection:cleared';

export interface CanvasEvent {
  type: CanvasEventType;
  target?: any;
  timestamp: number;
  userId: string;
}
