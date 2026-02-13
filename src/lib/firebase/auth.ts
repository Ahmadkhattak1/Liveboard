import {
  AuthCredential,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInAnonymously,
  signInWithPopup,
  signInWithCredential,
  setPersistence,
  getAuth as getAuthForApp,
  GoogleAuthProvider,
  linkWithPopup,
  updateProfile,
  User as FirebaseUser,
  onIdTokenChanged,
  UserCredential,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { deleteApp, initializeApp } from 'firebase/app';
import { app, auth } from './config';
import { User, LoginCredentials, SignupCredentials } from '@/types/user';
import { getRandomEmoji, USER_EMOJIS } from '@/lib/constants/tools';
import { getRandomColor, USER_COLORS } from '@/lib/constants/colors';
import {
  deleteUserDataFromStores,
  ensureUserProfileInFirestore,
  getCachedUserSnapshot,
  getFullUserFromFirestore,
  mergeImportedUserDataIntoAccount,
  UserProfileSeed,
} from './userStore';
import { transferBoardOwnership } from './database';

let authPersistencePromise: Promise<void> | null = null;

interface LoginWithGoogleOptions {
  boardIdToMigrate?: string | null;
}

export async function ensureAuthPersistence(): Promise<void> {
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence)
      .catch((error) => {
        console.warn(
          'Unable to enable local Firebase auth persistence. Continuing with default behavior.',
          error
        );
      })
      .then(() => undefined);
  }

  await authPersistencePromise;
}

function getStableIndexFromString(value: string, modulo: number): number {
  if (modulo <= 0) {
    return 0;
  }

  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % modulo;
}

function getStableUserEmoji(userId: string): string {
  return USER_EMOJIS[getStableIndexFromString(userId, USER_EMOJIS.length)] || '👤';
}

function getStableUserColor(userId: string): string {
  return USER_COLORS[getStableIndexFromString(userId, USER_COLORS.length)] || '#2563EB';
}

function normalizeDisplayNameValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function deriveDisplayNameFromEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string' || email.length === 0) {
    return null;
  }

  const [localPart] = email.split('@');
  if (!localPart) {
    return null;
  }

  const normalizedLocalPart = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalizedLocalPart.length === 0) {
    return null;
  }

  return normalizedLocalPart
    .split(' ')
    .map((segment) => {
      if (segment.length === 0) {
        return '';
      }

      return segment[0].toUpperCase() + segment.slice(1);
    })
    .join(' ');
}

function resolveFirebaseDisplayName(firebaseUser: FirebaseUser): string | null {
  const directDisplayName = normalizeDisplayNameValue(firebaseUser.displayName);
  if (directDisplayName) {
    return directDisplayName;
  }

  for (const providerProfile of firebaseUser.providerData) {
    const providerDisplayName = normalizeDisplayNameValue(providerProfile.displayName);
    if (providerDisplayName) {
      return providerDisplayName;
    }
  }

  return deriveDisplayNameFromEmail(firebaseUser.email);
}

function isPlaceholderDisplayName(displayName: string): boolean {
  return (
    displayName === 'Anonymous' ||
    displayName.startsWith('Anonymous ') ||
    displayName === 'Google User'
  );
}

function toUserProfileSeed(
  firebaseUser: FirebaseUser,
  overrides: Partial<UserProfileSeed> = {}
): UserProfileSeed {
  const emoji = overrides.emoji ?? getStableUserEmoji(firebaseUser.uid);
  const resolvedDisplayName = resolveFirebaseDisplayName(firebaseUser);

  return {
    email: overrides.email ?? firebaseUser.email,
    displayName:
      overrides.displayName ??
      resolvedDisplayName ??
      (firebaseUser.isAnonymous ? `Anonymous ${emoji}` : 'Google User'),
    emoji,
    color: overrides.color ?? getStableUserColor(firebaseUser.uid),
    isAnonymous: overrides.isAnonymous ?? firebaseUser.isAnonymous,
  };
}

function isAccountAlreadyLinkedError(error: unknown): error is FirebaseError {
  if (!(error instanceof FirebaseError)) {
    return false;
  }

  return (
    error.code === 'auth/credential-already-in-use' ||
    error.code === 'auth/email-already-in-use' ||
    error.code === 'auth/account-exists-with-different-credential'
  );
}

function buildFallbackUser(firebaseUser: FirebaseUser): User {
  const emoji = getStableUserEmoji(firebaseUser.uid);
  const resolvedDisplayName = resolveFirebaseDisplayName(firebaseUser);

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    displayName:
      resolvedDisplayName ??
      (firebaseUser.isAnonymous ? `Anonymous ${emoji}` : 'Anonymous'),
    emoji,
    color: getStableUserColor(firebaseUser.uid),
    createdBoards: [],
    createdAt: Date.now(),
    isAnonymous: firebaseUser.isAnonymous,
  };
}

function applyStoredProfile(
  firebaseUser: FirebaseUser,
  storedProfile: Awaited<ReturnType<typeof getFullUserFromFirestore>>,
  fallbackUser: User = buildFallbackUser(firebaseUser)
): User {
  if (!storedProfile) {
    return fallbackUser;
  }

  const storedDisplayName = normalizeDisplayNameValue(storedProfile.displayName);
  const shouldPreferFallbackDisplayName =
    !storedDisplayName ||
    (isPlaceholderDisplayName(storedDisplayName) &&
      !isPlaceholderDisplayName(fallbackUser.displayName));

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email ?? storedProfile.email,
    displayName: shouldPreferFallbackDisplayName
      ? fallbackUser.displayName
      : storedDisplayName,
    emoji: storedProfile.emoji || fallbackUser.emoji,
    color: storedProfile.color || fallbackUser.color,
    createdBoards: storedProfile.createdBoards,
    createdAt: storedProfile.createdAt,
    isAnonymous: firebaseUser.isAnonymous,
  };
}

function convertFirebaseUserWithDefaults(firebaseUser: FirebaseUser): User {
  const fallbackUser = buildFallbackUser(firebaseUser);
  const cachedProfile = getCachedUserSnapshot(firebaseUser.uid);
  return applyStoredProfile(firebaseUser, cachedProfile, fallbackUser);
}

function normalizeBoardIdCandidates(candidates: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      candidates.filter(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.trim().length > 0
      )
    )
  );
}

async function convertFirebaseUserWithProfile(
  firebaseUser: FirebaseUser | null
): Promise<User | null> {
  if (!firebaseUser) {
    return null;
  }

  // Read-only: do not call ensureUserProfileInFirestore here.
  // Profile creation/updates are handled by the sign-in functions
  // (loginAnonymously, loginWithGoogle, loginWithEmail, etc.).
  // Writing here would race with migrateAnonymousUserIntoExistingGoogleAccount
  // and overwrite merged board data during account migration.
  const storedProfile = await getFullUserFromFirestore(firebaseUser.uid);
  return applyStoredProfile(firebaseUser, storedProfile);
}

async function syncUserProfileInFirestoreSafely(
  firebaseUser: FirebaseUser,
  overrides: Partial<UserProfileSeed> = {}
): Promise<void> {
  try {
    await ensureUserProfileInFirestore(firebaseUser.uid, toUserProfileSeed(firebaseUser, overrides));
  } catch (error) {
    console.warn(
      'Unable to persist user profile in Firestore. Keeping authentication session active.',
      error
    );
  }
}

async function resolveUserIdForCredential(credential: AuthCredential): Promise<string> {
  const secondaryAppName = `liveboard-migration-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const secondaryApp = initializeApp(app.options, secondaryAppName);

  try {
    const secondaryAuth = getAuthForApp(secondaryApp);
    const secondarySignIn = await signInWithCredential(secondaryAuth, credential);
    return secondarySignIn.user.uid;
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch (cleanupError) {
      console.warn('Unable to clean up secondary Firebase app:', cleanupError);
    }
  }
}

async function migrateAnonymousUserIntoExistingGoogleAccount(
  anonymousUser: FirebaseUser,
  credential: AuthCredential,
  fallbackBoardIds: string[] = []
): Promise<UserCredential> {
  const anonymousUserId = anonymousUser.uid;
  const sourceSnapshot = await getFullUserFromFirestore(anonymousUserId);
  const sourceBoards = sourceSnapshot?.createdBoards ?? [];
  const boardIdsToMigrate = normalizeBoardIdCandidates([
    ...sourceBoards,
    ...fallbackBoardIds,
  ]);
  const targetUserId = await resolveUserIdForCredential(credential);

  if (boardIdsToMigrate.length > 0) {
    await transferBoardOwnership(anonymousUserId, targetUserId, boardIdsToMigrate);
  }

  await deleteUserDataFromStores(anonymousUserId);

  const googleCredential = await signInWithCredential(auth, credential);
  const googleSeed = toUserProfileSeed(googleCredential.user, {
    isAnonymous: false,
  });

  await mergeImportedUserDataIntoAccount(
    googleCredential.user.uid,
    googleSeed,
    sourceSnapshot,
    boardIdsToMigrate
  );
  // Do not delete the anonymous auth account here.
  // In credential-already-in-use migrations we switch sessions mid-flight,
  // and deleting the previous user can trigger auth-state churn in some clients.

  return googleCredential;
}

export async function loginWithEmail(
  credentials: LoginCredentials
): Promise<UserCredential> {
  await ensureAuthPersistence();
  const userCredential = await signInWithEmailAndPassword(
    auth,
    credentials.email,
    credentials.password
  );
  await syncUserProfileInFirestoreSafely(userCredential.user, {
    email: userCredential.user.email ?? credentials.email,
    isAnonymous: false,
  });
  return userCredential;
}

export async function signupWithEmail(
  credentials: SignupCredentials
): Promise<UserCredential> {
  await ensureAuthPersistence();
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    credentials.email,
    credentials.password
  );

  await updateProfile(userCredential.user, {
    displayName: credentials.displayName,
  });

  const emoji = getRandomEmoji();
  const color = getRandomColor();

  await syncUserProfileInFirestoreSafely(userCredential.user, {
    email: credentials.email,
    displayName: credentials.displayName,
    emoji,
    color,
    isAnonymous: false,
  });

  return userCredential;
}

export async function loginAnonymously(): Promise<UserCredential> {
  await ensureAuthPersistence();
  const userCredential = await signInAnonymously(auth);

  await syncUserProfileInFirestoreSafely(userCredential.user, {
    email: null,
    isAnonymous: true,
  });

  return userCredential;
}

export async function loginWithGoogle(
  options: LoginWithGoogleOptions = {}
): Promise<UserCredential> {
  await ensureAuthPersistence();
  const provider = new GoogleAuthProvider();
  const currentUser = auth.currentUser;
  const boardIdsToMigrate = normalizeBoardIdCandidates([options.boardIdToMigrate]);
  if (currentUser?.isAnonymous) {
    try {
      const linkedCredential = await linkWithPopup(currentUser, provider);
      await syncUserProfileInFirestoreSafely(linkedCredential.user, {
        isAnonymous: false,
      });
      return linkedCredential;
    } catch (linkError) {
      if (!isAccountAlreadyLinkedError(linkError)) {
        throw linkError;
      }

      const credentialFromError = GoogleAuthProvider.credentialFromError(linkError);
      if (!credentialFromError) {
        throw new Error(
          'Unable to complete account migration. Please try signing in with Google again.'
        );
      }

      try {
        return await migrateAnonymousUserIntoExistingGoogleAccount(
          currentUser,
          credentialFromError,
          boardIdsToMigrate
        );
      } catch (migrationError) {
        if (boardIdsToMigrate.length > 0) {
          console.warn(
            'Unable to migrate anonymous board data to the selected Google account.',
            migrationError
          );
          throw new Error(
            'Unable to migrate this board to your Google account. Please try again.'
          );
        }

        console.warn(
          'Unable to migrate anonymous user data to the existing Google account. Proceeding with Google sign-in.',
          migrationError
        );

        const fallbackGoogleCredential = await signInWithCredential(auth, credentialFromError);
        await syncUserProfileInFirestoreSafely(fallbackGoogleCredential.user, {
          isAnonymous: false,
        });
        return fallbackGoogleCredential;
      }
    }
  }

  const googleCredential = await signInWithPopup(auth, provider);
  await syncUserProfileInFirestoreSafely(googleCredential.user, {
    isAnonymous: false,
  });
  return googleCredential;
}

export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

export async function createUserProfile(
  userId: string,
  data: UserProfileSeed
): Promise<void> {
  await ensureUserProfileInFirestore(userId, data);
}

export function convertFirebaseUser(firebaseUser: FirebaseUser | null): User | null {
  if (!firebaseUser) {
    return null;
  }

  return convertFirebaseUserWithDefaults(firebaseUser);
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  let eventVersion = 0;

  // onIdTokenChanged also fires on provider-link/token changes where uid is unchanged
  // (anonymous -> Google link), preventing stale "guest" UI state.
  return onIdTokenChanged(auth, (firebaseUser) => {
    const currentVersion = eventVersion + 1;
    eventVersion = currentVersion;

    // Never block auth state delivery on profile/network calls.
    callback(convertFirebaseUser(firebaseUser));

    void (async () => {
      if (!firebaseUser) {
        return;
      }

      try {
        const user = await convertFirebaseUserWithProfile(firebaseUser);
        if (currentVersion !== eventVersion) {
          return;
        }
        callback(user);
      } catch (error) {
        console.error('Error resolving authenticated user profile:', error);
        if (currentVersion !== eventVersion) {
          return;
        }
        callback(convertFirebaseUser(firebaseUser));
      }
    })();
  });
}

export function getCurrentUser(): User | null {
  return convertFirebaseUser(auth.currentUser);
}
