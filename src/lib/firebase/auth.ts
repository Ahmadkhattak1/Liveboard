import {
  AuthCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInAnonymously,
  signInWithPopup,
  signInWithCredential,
  getAuth as getAuthForApp,
  GoogleAuthProvider,
  linkWithPopup,
  updateProfile,
  User as FirebaseUser,
  onAuthStateChanged,
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

function toUserProfileSeed(
  firebaseUser: FirebaseUser,
  overrides: Partial<UserProfileSeed> = {}
): UserProfileSeed {
  const emoji = overrides.emoji ?? getStableUserEmoji(firebaseUser.uid);

  return {
    email: overrides.email ?? firebaseUser.email,
    displayName:
      overrides.displayName ??
      firebaseUser.displayName ??
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

function convertFirebaseUserWithDefaults(firebaseUser: FirebaseUser): User {
  const cachedProfile = getCachedUserSnapshot(firebaseUser.uid);
  if (cachedProfile) {
    return applyStoredProfile(firebaseUser, cachedProfile);
  }

  const emoji = getStableUserEmoji(firebaseUser.uid);

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    displayName:
      firebaseUser.displayName ??
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
  storedProfile: Awaited<ReturnType<typeof getFullUserFromFirestore>>
): User {
  const fallbackUser = convertFirebaseUserWithDefaults(firebaseUser);

  if (!storedProfile) {
    return fallbackUser;
  }

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email ?? storedProfile.email,
    displayName: storedProfile.displayName || fallbackUser.displayName,
    emoji: storedProfile.emoji || fallbackUser.emoji,
    color: storedProfile.color || fallbackUser.color,
    createdBoards: storedProfile.createdBoards,
    createdAt: storedProfile.createdAt,
    isAnonymous: firebaseUser.isAnonymous,
  };
}

async function convertFirebaseUserWithProfile(
  firebaseUser: FirebaseUser | null
): Promise<User | null> {
  if (!firebaseUser) {
    return null;
  }

  const seed = toUserProfileSeed(firebaseUser, {
    isAnonymous: firebaseUser.isAnonymous,
  });
  await ensureUserProfileInFirestore(firebaseUser.uid, seed);
  const storedProfile = await getFullUserFromFirestore(firebaseUser.uid);
  return applyStoredProfile(firebaseUser, storedProfile);
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
  credential: AuthCredential
): Promise<UserCredential> {
  const anonymousUserId = anonymousUser.uid;
  const sourceSnapshot = await getFullUserFromFirestore(anonymousUserId);
  const sourceBoards = sourceSnapshot?.createdBoards ?? [];
  const targetUserId = await resolveUserIdForCredential(credential);

  if (sourceBoards.length > 0) {
    await transferBoardOwnership(anonymousUserId, targetUserId, sourceBoards);
  }

  await deleteUserDataFromStores(anonymousUserId);

  const googleCredential = await signInWithCredential(auth, credential);
  const googleSeed = toUserProfileSeed(googleCredential.user, {
    isAnonymous: false,
  });

  await mergeImportedUserDataIntoAccount(
    googleCredential.user.uid,
    googleSeed,
    sourceSnapshot
  );

  try {
    await anonymousUser.delete();
  } catch (deleteError) {
    console.warn('Unable to delete anonymous user after migration:', deleteError);
  }

  return googleCredential;
}

export async function loginWithEmail(
  credentials: LoginCredentials
): Promise<UserCredential> {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    credentials.email,
    credentials.password
  );
  await ensureUserProfileInFirestore(
    userCredential.user.uid,
    toUserProfileSeed(userCredential.user, {
      email: userCredential.user.email ?? credentials.email,
      isAnonymous: false,
    })
  );
  return userCredential;
}

export async function signupWithEmail(
  credentials: SignupCredentials
): Promise<UserCredential> {
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

  await createUserProfile(userCredential.user.uid, {
    email: credentials.email,
    displayName: credentials.displayName,
    emoji,
    color,
    isAnonymous: false,
  });

  return userCredential;
}

export async function loginAnonymously(): Promise<UserCredential> {
  const userCredential = await signInAnonymously(auth);

  await ensureUserProfileInFirestore(
    userCredential.user.uid,
    toUserProfileSeed(userCredential.user, {
      email: null,
      isAnonymous: true,
    })
  );

  return userCredential;
}

export async function loginWithGoogle(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  const currentUser = auth.currentUser;
  if (currentUser?.isAnonymous) {
    try {
      const linkedCredential = await linkWithPopup(currentUser, provider);
      await ensureUserProfileInFirestore(
        linkedCredential.user.uid,
        toUserProfileSeed(linkedCredential.user, {
          isAnonymous: false,
        })
      );
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

      return migrateAnonymousUserIntoExistingGoogleAccount(
        currentUser,
        credentialFromError
      );
    }
  }

  const googleCredential = await signInWithPopup(auth, provider);
  await ensureUserProfileInFirestore(
    googleCredential.user.uid,
    toUserProfileSeed(googleCredential.user, {
      isAnonymous: false,
    })
  );
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

  return onAuthStateChanged(auth, (firebaseUser) => {
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
