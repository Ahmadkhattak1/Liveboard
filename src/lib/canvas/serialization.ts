import * as fabric from 'fabric';
import { SerializedCanvasState } from '@/types/board';
import { CONNECTOR_HISTORY_PROPS } from './connectors';

export const CANVAS_SERIALIZATION_PROPS = [
  'id',
  'createdBy',
  'createdAt',
  'updatedAt',
  'updatedBy',
  'stickyNoteId',
  'stickyRole',
  'stickyHasPlaceholder',
  ...CONNECTOR_HISTORY_PROPS,
] as const;

export function serializeCanvas(canvas: fabric.Canvas): SerializedCanvasState {
  const serializer = canvas as fabric.Canvas & {
    toJSON: (propertiesToInclude?: string[]) => SerializedCanvasState;
  };

  return serializer.toJSON([...CANVAS_SERIALIZATION_PROPS]);
}

export function stringifyCanvasState(canvasState: SerializedCanvasState): string {
  return JSON.stringify(canvasState);
}

