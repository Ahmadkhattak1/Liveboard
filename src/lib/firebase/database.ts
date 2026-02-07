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
  serverTimestamp,
  onDisconnect,
  DatabaseReference,
} from 'firebase/database';
import { database } from './config';
import {
  Board,
  BoardMetadata,
  CanvasObjectData,
  UserPresence,
  BoardOperation,
} from '@/types/board';
import { generateBoardId } from '@/lib/utils/generateId';

export async function createBoard(userId: string, title?: string): Promise<string> {
  const boardId = generateBoardId();
  const boardRef = ref(database, `boards/${boardId}`);

  const boardData: Board = {
    metadata: {
      id: boardId,
      title: title || 'Untitled Board',
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
      callback(snapshot.val());
    } else {
      callback({});
    }
  });
}
