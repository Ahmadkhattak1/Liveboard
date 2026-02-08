import {
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  push,
  onDisconnect,
} from 'firebase/database';
import { database } from './config';
import {
  Board,
  BoardCanvas,
  BoardMetadata,
  CanvasObjectData,
  SerializedCanvasState,
  UserPresence,
} from '@/types/board';
import { generateBoardId } from '@/lib/utils/generateId';
import { getRandomBoardEmoji } from '@/lib/constants/tools';

function normalizeBoardIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === 'string' && item.length > 0
    );
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).filter(
      (item): item is string => typeof item === 'string' && item.length > 0
    );
  }

  return [];
}

function normalizePresenceMap(value: unknown): Record<string, UserPresence> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, UserPresence>>(
    (accumulator, [userId, rawPresence]) => {
      if (!rawPresence || typeof rawPresence !== 'object') {
        return accumulator;
      }

      const presence = rawPresence as Partial<UserPresence>;
      const cursorX =
        typeof presence.cursor?.x === 'number' && Number.isFinite(presence.cursor.x)
          ? presence.cursor.x
          : 0;
      const cursorY =
        typeof presence.cursor?.y === 'number' && Number.isFinite(presence.cursor.y)
          ? presence.cursor.y
          : 0;
      const rawActivity = presence.activity;
      const trail =
        Array.isArray(rawActivity?.trail)
          ? rawActivity.trail
              .filter(
                (point): point is { x: number; y: number } =>
                  Boolean(point) &&
                  typeof point.x === 'number' &&
                  Number.isFinite(point.x) &&
                  typeof point.y === 'number' &&
                  Number.isFinite(point.y)
              )
              .map((point) => ({ x: point.x, y: point.y }))
          : [];

      accumulator[userId] = {
        userId,
        displayName: typeof presence.displayName === 'string' ? presence.displayName : 'Unknown',
        color: typeof presence.color === 'string' ? presence.color : '#2563EB',
        emoji: typeof presence.emoji === 'string' ? presence.emoji : '👤',
        cursor: { x: cursorX, y: cursorY },
        lastSeen:
          typeof presence.lastSeen === 'number' && Number.isFinite(presence.lastSeen)
            ? presence.lastSeen
            : 0,
        isActive: Boolean(presence.isActive),
        activity: rawActivity && typeof rawActivity === 'object'
          ? {
              tool:
                typeof rawActivity.tool === 'string' ? rawActivity.tool : undefined,
              isDrawing: Boolean(rawActivity.isDrawing),
              trail,
              updatedAt:
                typeof rawActivity.updatedAt === 'number' && Number.isFinite(rawActivity.updatedAt)
                  ? rawActivity.updatedAt
                  : undefined,
            }
          : undefined,
      };
      return accumulator;
    },
    {}
  );
}

function sanitizeForRealtimeDatabase<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function createBoard(userId: string, title?: string): Promise<string> {
  const boardId = generateBoardId();
  const boardRef = ref(database, `boards/${boardId}`);

  const boardData: Board = {
    metadata: {
      id: boardId,
      title: title || 'Untitled Board',
      emoji: getRandomBoardEmoji(),
      createdAt: Date.now(),
      createdBy: userId,
      updatedAt: Date.now(),
      isPublic: true,
    },
    canvas: {
      version: '6.0.0',
      objects: [],
      background: '#ffffff',
    },
    presence: {},
  };

  await set(boardRef, boardData);

  const userRef = ref(database, `users/${userId}/createdBoards`);
  const userBoards = await get(userRef);
  const boards = userBoards.exists() ? userBoards.val() : [];
  boards.push(boardId);
  await set(userRef, boards);

  return boardId;
}

export async function deleteBoardForUser(
  userId: string,
  boardId: string
): Promise<void> {
  const boardRef = ref(database, `boards/${boardId}`);
  const boardSnapshot = await get(boardRef);

  if (boardSnapshot.exists()) {
    const board = boardSnapshot.val() as Board;
    if (board.metadata.createdBy !== userId) {
      throw new Error('Only the board owner can delete this board.');
    }
  }

  await remove(boardRef);

  const userBoardsRef = ref(database, `users/${userId}/createdBoards`);
  const userBoardsSnapshot = await get(userBoardsRef);

  if (!userBoardsSnapshot.exists()) {
    return;
  }

  const nextBoards = normalizeBoardIds(userBoardsSnapshot.val()).filter(
    (id) => id !== boardId
  );
  await set(userBoardsRef, nextBoards);
}

export async function getBoard(boardId: string): Promise<Board | null> {
  const boardRef = ref(database, `boards/${boardId}`);
  const snapshot = await get(boardRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.val() as Board;
}

export async function updateBoardMetadata(
  boardId: string,
  metadata: Partial<BoardMetadata>
): Promise<void> {
  const metadataRef = ref(database, `boards/${boardId}/metadata`);
  await update(metadataRef, {
    ...metadata,
    updatedAt: Date.now(),
  });
}

export async function updateBoardEmoji(boardId: string, emoji: string): Promise<void> {
  const metadataRef = ref(database, `boards/${boardId}/metadata`);
  await update(metadataRef, { emoji });
}

export async function saveBoardCanvasState(
  boardId: string,
  canvasState: SerializedCanvasState,
  userId: string
): Promise<void> {
  const now = Date.now();
  const sanitizedCanvasState = sanitizeForRealtimeDatabase(canvasState);
  const objectCount = Array.isArray(sanitizedCanvasState.objects)
    ? sanitizedCanvasState.objects.length
    : 0;
  const boardRef = ref(database, `boards/${boardId}`);

  await update(boardRef, {
    canvas: {
      ...sanitizedCanvasState,
      objectCount,
      updatedAt: now,
      updatedBy: userId,
    },
    'metadata/updatedAt': now,
  });
}

export function subscribeToBoardCanvas(
  boardId: string,
  callback: (canvasState: BoardCanvas) => void
): () => void {
  const canvasRef = ref(database, `boards/${boardId}/canvas`);
  return onValue(canvasRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback({
        version: '6.0.0',
        objects: [],
        background: '#ffffff',
      });
      return;
    }

    callback(snapshot.val() as BoardCanvas);
  });
}

export async function getUserProfile(
  userId: string
): Promise<{ displayName: string; emoji: string; color: string } | null> {
  const userRef = ref(database, `users/${userId}`);
  const userSnapshot = await get(userRef);

  if (!userSnapshot.exists()) {
    return null;
  }

  const rawUser = userSnapshot.val() as Record<string, unknown>;
  return {
    displayName:
      typeof rawUser.displayName === 'string' && rawUser.displayName.trim().length > 0
        ? rawUser.displayName
        : 'Anonymous',
    emoji: typeof rawUser.emoji === 'string' && rawUser.emoji.length > 0 ? rawUser.emoji : '👤',
    color: typeof rawUser.color === 'string' && rawUser.color.length > 0 ? rawUser.color : '#2563EB',
  };
}

export async function addCanvasObject(
  boardId: string,
  object: CanvasObjectData
): Promise<void> {
  const objectsRef = ref(database, `boards/${boardId}/canvas/objects`);
  const newObjectRef = push(objectsRef);
  await set(newObjectRef, object);
}

export async function updateCanvasObject(
  boardId: string,
  objectId: string,
  updates: Partial<CanvasObjectData>
): Promise<void> {
  const objects = await getCanvasObjects(boardId);
  const objectIndex = objects.findIndex((obj) => obj.id === objectId);

  if (objectIndex !== -1) {
    const objectRef = ref(
      database,
      `boards/${boardId}/canvas/objects/${objectIndex}`
    );
    await update(objectRef, {
      ...updates,
      updatedAt: Date.now(),
    });
  }
}

export async function removeCanvasObject(
  boardId: string,
  objectId: string
): Promise<void> {
  const objects = await getCanvasObjects(boardId);
  const objectIndex = objects.findIndex((obj) => obj.id === objectId);

  if (objectIndex !== -1) {
    const objectRef = ref(
      database,
      `boards/${boardId}/canvas/objects/${objectIndex}`
    );
    await remove(objectRef);
  }
}

export async function getCanvasObjects(
  boardId: string
): Promise<CanvasObjectData[]> {
  const objectsRef = ref(database, `boards/${boardId}/canvas/objects`);
  const snapshot = await get(objectsRef);

  if (!snapshot.exists()) {
    return [];
  }

  return Object.values(snapshot.val());
}

export async function updatePresence(
  boardId: string,
  userId: string,
  presence: UserPresence
): Promise<void> {
  const presenceRef = ref(database, `boards/${boardId}/presence/${userId}`);
  await set(presenceRef, presence);

  onDisconnect(presenceRef).remove();
}

export async function updatePresenceFields(
  boardId: string,
  userId: string,
  updates: Partial<UserPresence>
): Promise<void> {
  const presenceRef = ref(database, `boards/${boardId}/presence/${userId}`);
  await update(presenceRef, {
    ...updates,
    lastSeen: Date.now(),
  });
}

export async function removePresence(
  boardId: string,
  userId: string
): Promise<void> {
  const presenceRef = ref(database, `boards/${boardId}/presence/${userId}`);
  await remove(presenceRef);
}

export function subscribeToBoard(
  boardId: string,
  callback: (board: Board) => void
): () => void {
  const boardRef = ref(database, `boards/${boardId}`);
  const unsubscribe = onValue(boardRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as Board);
    }
  });

  return unsubscribe;
}

export function subscribeToCanvasObjects(
  boardId: string,
  callbacks: {
    onAdded?: (object: CanvasObjectData) => void;
    onChanged?: (object: CanvasObjectData) => void;
    onRemoved?: (objectId: string) => void;
  }
): () => void {
  const objectsRef = ref(database, `boards/${boardId}/canvas/objects`);

  const unsubscribes: Array<() => void> = [];

  if (callbacks.onAdded) {
    const addedUnsubscribe = onChildAdded(objectsRef, (snapshot) => {
      callbacks.onAdded!(snapshot.val() as CanvasObjectData);
    });
    unsubscribes.push(addedUnsubscribe);
  }

  if (callbacks.onChanged) {
    const changedUnsubscribe = onChildChanged(objectsRef, (snapshot) => {
      callbacks.onChanged!(snapshot.val() as CanvasObjectData);
    });
    unsubscribes.push(changedUnsubscribe);
  }

  if (callbacks.onRemoved) {
    const removedUnsubscribe = onChildRemoved(objectsRef, (snapshot) => {
      const object = snapshot.val() as CanvasObjectData;
      callbacks.onRemoved!(object.id);
    });
    unsubscribes.push(removedUnsubscribe);
  }

  return () => {
    unsubscribes.forEach((unsub) => unsub());
  };
}

export function subscribeToPresence(
  boardId: string,
  callback: (presence: Record<string, UserPresence>) => void
): () => void {
  const presenceRef = ref(database, `boards/${boardId}/presence`);
  return onValue(presenceRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(normalizePresenceMap(snapshot.val()));
    } else {
      callback({});
    }
  });
}
