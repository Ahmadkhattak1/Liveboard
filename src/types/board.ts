export interface BoardMetadata {
  id: string;
  title?: string;
  emoji?: string;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  isPublic: boolean;
  shareCode?: string | null;
  allowSharedEditing?: boolean;
}

export interface SerializedCanvasState {
  version?: string;
  objects?: unknown[];
  [key: string]: unknown;
}

export interface BoardCanvas {
  version: string;
  objects: unknown[];
  background?: string;
  updatedAt?: number;
  updatedBy?: string;
  [key: string]: unknown;
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
  sessionId?: string;
  displayName: string;
  color: string;
  emoji: string;
  cursor: {
    x: number;
    y: number;
  };
  lastSeen: number;
  isActive: boolean;
  activity?: {
    tool?: string;
    isDrawing?: boolean;
    trail?: Array<{
      x: number;
      y: number;
    }>;
    updatedAt?: number;
  };
}

export interface BoardOperation {
  id: string;
  type: 'add' | 'modify' | 'delete' | 'move';
  objectId: string;
  userId: string;
  timestamp: number;
  data: any;
}
