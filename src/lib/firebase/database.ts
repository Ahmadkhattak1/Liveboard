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
import { generateBoardId, generateShareCode } from '@/lib/utils/generateId';
import { getRandomBoardEmoji } from '@/lib/constants/tools';
import { normalizeShareCode } from '@/lib/utils/shareCode';

interface BoardShareSettings {
  isPublic: boolean;
  shareCode: string | null;
}

function resolveBoardShareCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedCode = normalizeShareCode(value);
  return normalizedCode.length > 0 ? normalizedCode : null;
}

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
      isPublic: false,
      shareCode: null,
    },
    canvas: {
      version: '6.0.0',
      objects: [],
      background: 'transparent',
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

async function getOwnedBoard(boardId: string, ownerUserId: string): Promise<Board> {
  const boardRef = ref(database, `boards/${boardId}`);
  const boardSnapshot = await get(boardRef);

  if (!boardSnapshot.exists()) {
    throw new Error('Board not found.');
  }

  const board = boardSnapshot.val() as Board;
  if (board.metadata.createdBy !== ownerUserId) {
    throw new Error('Only the board owner can manage sharing for this board.');
  }

  return board;
}

async function resolveAvailableShareCode(
  boardId: string,
  preferredCode: string | null
): Promise<string> {
  const preferredNormalized = resolveBoardShareCode(preferredCode);

  if (preferredNormalized) {
    const preferredRef = ref(database, `shareCodes/${preferredNormalized}`);
    const preferredSnapshot = await get(preferredRef);
    if (!preferredSnapshot.exists() || preferredSnapshot.val() === boardId) {
      return preferredNormalized;
    }
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidateCode = generateShareCode();
    const candidateRef = ref(database, `shareCodes/${candidateCode}`);
    const candidateSnapshot = await get(candidateRef);
    if (!candidateSnapshot.exists() || candidateSnapshot.val() === boardId) {
      return candidateCode;
    }
  }

  throw new Error('Unable to generate a unique share code. Please try again.');
}

export async function updateBoardSharing(
  boardId: string,
  ownerUserId: string,
  isPublic: boolean
): Promise<BoardShareSettings> {
  const board = await getOwnedBoard(boardId, ownerUserId);
  const rootRef = ref(database);
  const now = Date.now();
  const existingCode = resolveBoardShareCode(board.metadata.shareCode);

  if (!isPublic) {
    const updates: Record<string, unknown> = {
      [`boards/${boardId}/metadata/isPublic`]: false,
      [`boards/${boardId}/metadata/shareCode`]: null,
      [`boards/${boardId}/metadata/updatedAt`]: now,
    };
    if (existingCode) {
      updates[`shareCodes/${existingCode}`] = null;
    }

    await update(rootRef, updates);

    return {
      isPublic: false,
      shareCode: null,
    };
  }

  const shareCode = await resolveAvailableShareCode(boardId, existingCode);
  const updates: Record<string, unknown> = {
    [`boards/${boardId}/metadata/isPublic`]: true,
    [`boards/${boardId}/metadata/shareCode`]: shareCode,
    [`boards/${boardId}/metadata/updatedAt`]: now,
    [`shareCodes/${shareCode}`]: boardId,
  };
  if (existingCode && existingCode !== shareCode) {
    updates[`shareCodes/${existingCode}`] = null;
  }

  await update(rootRef, updates);

  return {
    isPublic: true,
    shareCode,
  };
}

export async function findPublicBoardByShareCode(code: string): Promise<string | null> {
  const normalizedCode = normalizeShareCode(code);
  if (!normalizedCode) {
    return null;
  }

  const lookupRef = ref(database, `shareCodes/${normalizedCode}`);
  const lookupSnapshot = await get(lookupRef);
  if (!lookupSnapshot.exists()) {
    const boardsRef = ref(database, 'boards');
    const boardsSnapshot = await get(boardsRef);
    if (!boardsSnapshot.exists()) {
      return null;
    }

    const boards = boardsSnapshot.val() as Record<string, Board | undefined>;
    const backfillMatch = Object.entries(boards).find(([, board]) => {
      if (!board) {
        return false;
      }

      const boardShareCode = resolveBoardShareCode(board.metadata.shareCode);
      return board.metadata.isPublic && boardShareCode === normalizedCode;
    });

    if (!backfillMatch) {
      return null;
    }

    const [backfilledBoardId] = backfillMatch;
    await set(lookupRef, backfilledBoardId);
    return backfilledBoardId;
  }

  const boardId = lookupSnapshot.val();
  if (typeof boardId !== 'string' || boardId.length === 0) {
    return null;
  }

  const board = await getBoard(boardId);
  if (!board) {
    await remove(lookupRef);
    return null;
  }

  const boardShareCode = resolveBoardShareCode(board.metadata.shareCode);
  if (!board.metadata.isPublic || boardShareCode !== normalizedCode) {
    return null;
  }

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

    const shareCode = resolveBoardShareCode(board.metadata.shareCode);
    if (shareCode) {
      const shareCodeRef = ref(database, `shareCodes/${shareCode}`);
      await remove(shareCodeRef);
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
        background: 'transparent',
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
  const presenceByUser: Record<string, UserPresence> = {};

  const emitPresence = () => {
    callback({ ...presenceByUser });
  };

  const upsertPresence = (userId: string, rawPresence: unknown) => {
    const normalized = normalizePresenceMap({ [userId]: rawPresence });
    const nextPresence = normalized[userId];
    if (!nextPresence) {
      return;
    }
    presenceByUser[userId] = nextPresence;
    emitPresence();
  };

  callback({});

  const addedUnsubscribe = onChildAdded(presenceRef, (snapshot) => {
    const userId = snapshot.key;
    if (!userId) {
      return;
    }
    upsertPresence(userId, snapshot.val());
  });

  const changedUnsubscribe = onChildChanged(presenceRef, (snapshot) => {
    const userId = snapshot.key;
    if (!userId) {
      return;
    }
    upsertPresence(userId, snapshot.val());
  });

  const removedUnsubscribe = onChildRemoved(presenceRef, (snapshot) => {
    const userId = snapshot.key;
    if (!userId || !(userId in presenceByUser)) {
      return;
    }
    delete presenceByUser[userId];
    emitPresence();
  });

  return () => {
    addedUnsubscribe();
    changedUnsubscribe();
    removedUnsubscribe();
  };
}
