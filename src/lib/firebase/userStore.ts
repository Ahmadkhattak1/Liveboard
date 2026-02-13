import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import {
  get as getRealtimeValue,
  ref as realtimeRef,
  remove as removeRealtimeValue,
} from 'firebase/database';
import { database, firestore } from './config';

export interface UserProfileSeed {
  email: string | null;
  displayName: string;
  emoji: string;
  color: string;
  isAnonymous: boolean;
}

interface StoredUserDocument extends UserProfileSeed {
  id: string;
  createdBoards: string[];
  createdAt: number;
  updatedAt: number;
}

const USER_COLLECTION = 'users';
const DEFAULT_USER_COLOR = '#2563EB';
const DEFAULT_USER_EMOJI = '👤';
const USER_CACHE_KEY_PREFIX = 'liveboard-user-cache:';
const FIRESTORE_OP_TIMEOUT_MS = 2500;
const RTDB_OP_TIMEOUT_MS = 2500;
const OFFLINE_NO_CACHE_ERROR = 'offline-no-cache';

export interface UserRecordSnapshot {
  email: string | null;
  displayName: string;
  emoji: string;
  color: string;
  createdBoards: string[];
  createdAt: number;
  isAnonymous: boolean;
}

function getUserCacheKey(userId: string): string {
  return `${USER_CACHE_KEY_PREFIX}${userId}`;
}

function isFirestoreOfflineError(error: unknown): boolean {
  if (!(error instanceof FirebaseError)) {
    return false;
  }

  return (
    error.code === 'unavailable' ||
    error.code === 'failed-precondition' ||
    error.message.toLowerCase().includes('offline')
  );
}

function isClientOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === 'request-timeout';
}

function isOfflineLikeError(error: unknown): boolean {
  return isFirestoreOfflineError(error) || isTimeoutError(error);
}

function isPermissionDeniedError(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === 'permission-denied';
}

function isOfflineNoCacheError(error: unknown): boolean {
  return error instanceof Error && error.message === OFFLINE_NO_CACHE_ERROR;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error('request-timeout'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function readCachedUser(userId: string): StoredUserDocument | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getUserCacheKey(userId));
    if (!raw) {
      return null;
    }

    return normalizeStoredUser(userId, JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeCachedUser(user: StoredUserDocument): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getUserCacheKey(user.id), JSON.stringify(user));
  } catch {
    // Ignore cache write failures (private mode, quota, etc).
  }
}

function removeCachedUser(userId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(getUserCacheKey(userId));
  } catch {
    // Ignore cache removal failures.
  }
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

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeOptionalEmail(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') {
    return 'Anonymous';
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Anonymous';
}

function isPlaceholderDisplayName(value: string): boolean {
  return (
    value === 'Anonymous' ||
    value.startsWith('Anonymous ') ||
    value === 'Google User'
  );
}

function mergeDisplayName(seedValue: string, existingValue: string | undefined): string {
  const seedDisplayName = normalizeDisplayName(seedValue);
  const existingDisplayName = normalizeDisplayName(existingValue);

  if (!existingValue || existingValue.trim().length === 0) {
    return seedDisplayName;
  }

  if (
    isPlaceholderDisplayName(existingDisplayName) &&
    !isPlaceholderDisplayName(seedDisplayName)
  ) {
    return seedDisplayName;
  }

  return existingDisplayName;
}

function normalizeEmoji(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : DEFAULT_USER_EMOJI;
}

function normalizeColor(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : DEFAULT_USER_COLOR;
}

function normalizeStoredUser(userId: string, value: unknown): StoredUserDocument {
  const now = Date.now();
  const record = value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};

  return {
    id: userId,
    email: normalizeOptionalEmail(record.email),
    displayName: normalizeDisplayName(record.displayName),
    emoji: normalizeEmoji(record.emoji),
    color: normalizeColor(record.color),
    isAnonymous: Boolean(record.isAnonymous),
    createdBoards: normalizeBoardIds(record.createdBoards),
    createdAt: normalizeTimestamp(record.createdAt, now),
    updatedAt: normalizeTimestamp(record.updatedAt, now),
  };
}

function toUserProfileShape(user: StoredUserDocument): {
  displayName: string;
  emoji: string;
  color: string;
} {
  return {
    displayName: user.displayName,
    emoji: user.emoji,
    color: user.color,
  };
}

function toUserRecordSnapshot(user: StoredUserDocument): UserRecordSnapshot {
  return {
    email: user.email,
    displayName: user.displayName,
    emoji: user.emoji,
    color: user.color,
    createdBoards: user.createdBoards,
    createdAt: user.createdAt,
    isAnonymous: user.isAnonymous,
  };
}

async function readRealtimeUser(userId: string): Promise<StoredUserDocument | null> {
  const legacyRef = realtimeRef(database, `users/${userId}`);
  const snapshot = typeof window !== 'undefined'
    ? await withTimeout(getRealtimeValue(legacyRef), RTDB_OP_TIMEOUT_MS)
    : await getRealtimeValue(legacyRef);
  if (!snapshot.exists()) {
    return null;
  }

  return normalizeStoredUser(userId, snapshot.val());
}

async function removeRealtimeUser(userId: string): Promise<void> {
  const legacyRef = realtimeRef(database, `users/${userId}`);
  await removeRealtimeValue(legacyRef);
}

async function readFirestoreUser(userId: string): Promise<StoredUserDocument | null> {
  const userDocRef = doc(firestore, USER_COLLECTION, userId);
  try {
    const snapshot = typeof window !== 'undefined'
      ? await withTimeout(getDoc(userDocRef), FIRESTORE_OP_TIMEOUT_MS)
      : await getDoc(userDocRef);
    if (!snapshot.exists()) {
      return null;
    }

    const user = normalizeStoredUser(userId, snapshot.data());
    writeCachedUser(user);
    return user;
  } catch (error) {
    if (isOfflineLikeError(error)) {
      const cachedUser = readCachedUser(userId);
      if (cachedUser) {
        return cachedUser;
      }
      throw new Error(OFFLINE_NO_CACHE_ERROR);
    }

    throw error;
  }
}

async function upsertFirestoreUser(user: StoredUserDocument): Promise<void> {
  const userDocRef = doc(firestore, USER_COLLECTION, user.id);
  writeCachedUser(user);

  try {
    if (typeof window !== 'undefined') {
      await withTimeout(setDoc(userDocRef, user, { merge: true }), FIRESTORE_OP_TIMEOUT_MS);
    } else {
      await setDoc(userDocRef, user, { merge: true });
    }
  } catch (error) {
    if (isOfflineLikeError(error)) {
      return;
    }

    throw error;
  }
}

async function migrateLegacyRealtimeUser(userId: string): Promise<StoredUserDocument | null> {
  try {
    const legacyUser = await readRealtimeUser(userId);
    if (!legacyUser) {
      return null;
    }

    const migratedUser: StoredUserDocument = {
      ...legacyUser,
      id: userId,
      updatedAt: Date.now(),
    };

    await upsertFirestoreUser(migratedUser);
    await removeRealtimeUser(userId);
    return migratedUser;
  } catch (error) {
    if (isOfflineLikeError(error)) {
      return readCachedUser(userId);
    }

    if (isPermissionDeniedError(error)) {
      // Legacy users/* RTDB reads are optional once Firestore is the source of truth.
      return null;
    }

    throw error;
  }
}

async function getOrMigrateUser(userId: string): Promise<StoredUserDocument | null> {
  try {
    const firestoreUser = await readFirestoreUser(userId);
    if (firestoreUser) {
      return firestoreUser;
    }
  } catch (error) {
    if (isOfflineNoCacheError(error)) {
      return null;
    }
    throw error;
  }

  if (isClientOffline()) {
    return readCachedUser(userId);
  }

  return migrateLegacyRealtimeUser(userId);
}

function mergeUserSeed(
  userId: string,
  seed: UserProfileSeed,
  existing: StoredUserDocument | null
): StoredUserDocument {
  const now = Date.now();

  return {
    id: userId,
    email: seed.email ?? existing?.email ?? null,
    displayName: mergeDisplayName(seed.displayName, existing?.displayName),
    emoji: normalizeEmoji(existing?.emoji || seed.emoji),
    color: normalizeColor(existing?.color || seed.color),
    isAnonymous: seed.isAnonymous,
    createdBoards: existing?.createdBoards ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function ensureUserProfileInFirestore(
  userId: string,
  seed: UserProfileSeed
): Promise<void> {
  const existingUser = await getOrMigrateUser(userId);
  const mergedUser = mergeUserSeed(userId, seed, existingUser);
  await upsertFirestoreUser(mergedUser);
}

export async function getUserProfileFromFirestore(
  userId: string
): Promise<{ displayName: string; emoji: string; color: string } | null> {
  const cachedUser = readCachedUser(userId);
  if (cachedUser) {
    return toUserProfileShape(cachedUser);
  }

  const user = await getOrMigrateUser(userId);
  if (!user) {
    return null;
  }

  return toUserProfileShape(user);
}

export async function getUserBoardIdsFromFirestore(userId: string): Promise<string[]> {
  const cachedUser = readCachedUser(userId);
  if (cachedUser) {
    return cachedUser.createdBoards;
  }

  const user = await getOrMigrateUser(userId);
  if (!user) {
    return [];
  }

  return user.createdBoards;
}

export async function addCreatedBoardToUser(userId: string, boardId: string): Promise<void> {
  const existingUser = await getOrMigrateUser(userId);
  const createdBoards = existingUser?.createdBoards ?? [];
  const nextBoards = createdBoards.includes(boardId)
    ? createdBoards
    : [...createdBoards, boardId];
  const now = Date.now();

  const nextUser: StoredUserDocument = {
    id: userId,
    email: existingUser?.email ?? null,
    displayName: existingUser?.displayName ?? 'Anonymous',
    emoji: existingUser?.emoji ?? DEFAULT_USER_EMOJI,
    color: existingUser?.color ?? DEFAULT_USER_COLOR,
    isAnonymous: existingUser?.isAnonymous ?? true,
    createdBoards: nextBoards,
    createdAt: existingUser?.createdAt ?? now,
    updatedAt: now,
  };

  await upsertFirestoreUser(nextUser);
}

export async function removeCreatedBoardFromUser(userId: string, boardId: string): Promise<void> {
  const existingUser = await getOrMigrateUser(userId);
  if (!existingUser) {
    return;
  }

  const nextBoards = existingUser.createdBoards.filter((id) => id !== boardId);
  await upsertFirestoreUser({
    ...existingUser,
    createdBoards: nextBoards,
    updatedAt: Date.now(),
  });
}

export async function mergeImportedUserDataIntoAccount(
  targetUserId: string,
  targetSeed: UserProfileSeed,
  sourceUserData: UserRecordSnapshot | null,
  additionalBoardIds: string[] = []
): Promise<string[]> {
  const targetUser = await getOrMigrateUser(targetUserId);
  const sourceBoards = sourceUserData?.createdBoards ?? [];
  const importedBoards = Array.from(
    new Set(
      [...sourceBoards, ...additionalBoardIds].filter(
        (boardId): boardId is string => typeof boardId === 'string' && boardId.length > 0
      )
    )
  );
  const targetBoards = targetUser?.createdBoards ?? [];
  const mergedBoards = Array.from(new Set([...targetBoards, ...importedBoards]));
  const now = Date.now();

  const mergedTargetUser: StoredUserDocument = {
    id: targetUserId,
    email: targetSeed.email ?? targetUser?.email ?? sourceUserData?.email ?? null,
    displayName: normalizeDisplayName(
      targetSeed.displayName || targetUser?.displayName || sourceUserData?.displayName
    ),
    emoji: normalizeEmoji(targetUser?.emoji || sourceUserData?.emoji || targetSeed.emoji),
    color: normalizeColor(targetUser?.color || sourceUserData?.color || targetSeed.color),
    isAnonymous: false,
    createdBoards: mergedBoards,
    createdAt: targetUser?.createdAt ?? now,
    updatedAt: now,
  };

  await upsertFirestoreUser(mergedTargetUser);
  return importedBoards;
}

export async function getFullUserFromFirestore(
  userId: string
): Promise<UserRecordSnapshot | null> {
  const user = await getOrMigrateUser(userId);
  if (!user) {
    return null;
  }

  return toUserRecordSnapshot(user);
}

export function getCachedUserSnapshot(userId: string): UserRecordSnapshot | null {
  const cachedUser = readCachedUser(userId);
  if (!cachedUser) {
    return null;
  }

  return toUserRecordSnapshot(cachedUser);
}

export async function deleteUserDataFromStores(userId: string): Promise<void> {
  const userDocRef = doc(firestore, USER_COLLECTION, userId);
  removeCachedUser(userId);

  try {
    if (typeof window !== 'undefined') {
      await withTimeout(deleteDoc(userDocRef), FIRESTORE_OP_TIMEOUT_MS);
    } else {
      await deleteDoc(userDocRef);
    }
  } catch (error) {
    if (!isOfflineLikeError(error)) {
      throw error;
    }
  }

  try {
    if (typeof window !== 'undefined') {
      await withTimeout(removeRealtimeUser(userId), RTDB_OP_TIMEOUT_MS);
    } else {
      await removeRealtimeUser(userId);
    }
  } catch (error) {
    if (!isOfflineLikeError(error) && !isPermissionDeniedError(error)) {
      throw error;
    }
  }
}
