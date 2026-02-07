export interface BoardMetadata {
  id: string;
  title?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  isPublic: boolean;
}

export interface BoardCanvas {
  version: string;
  objects: CanvasObjectData[];
  background: string;
}

export interface CanvasObjectData {
  id: string;
  type: 'path' | 'text' | 'image' | 'rect' | 'circle' | 'line';
  left: number;
  top: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  opacity?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  [key: string]: any; // Allow additional Fabric.js properties
}

export interface Board {
  metadata: BoardMetadata;
  canvas: BoardCanvas;
  presence: Record<string, UserPresence>;
}

export interface UserPresence {
  userId: string;
  displayName: string;
  color: string;
  emoji: string;
  cursor: {
    x: number;
    y: number;
  };
  lastSeen: number;
  isActive: boolean;
}

export interface BoardOperation {
  id: string;
  type: 'add' | 'modify' | 'delete' | 'move';
  objectId: string;
  userId: string;
  timestamp: number;
  data: any;
}
