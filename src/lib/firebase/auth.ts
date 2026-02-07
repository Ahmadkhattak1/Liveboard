import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInAnonymously,
  updateProfile,
  User as FirebaseUser,
  onAuthStateChanged,
  UserCredential,
} from 'firebase/auth';
import { auth } from './config';
import { User, LoginCredentials, SignupCredentials } from '@/types/user';
import { getRandomEmoji } from '@/lib/constants/tools';
import { getRandomColor } from '@/lib/constants/colors';
import { ref, set } from 'firebase/database';
import { database } from './config';

export async function loginWithEmail(
  credentials: LoginCredentials
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, credentials.email, credentials.password);
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

  const emoji = getRandomEmoji();
  const color = getRandomColor();

  await createUserProfile(userCredential.user.uid, {
    email: null,
    displayName: `Anonymous ${emoji}`,
    emoji,
    color,
    isAnonymous: true,
  });

  return userCredential;
}

export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

export async function createUserProfile(
  userId: string,
  data: {
    email: string | null;
    displayName: string;
    emoji: string;
    color: string;
    isAnonymous: boolean;
  }
): Promise<void> {
  const userRef = ref(database, `users/${userId}`);
  await set(userRef, {
    id: userId,
    email: data.email,
    displayName: data.displayName,
    emoji: data.emoji,
    color: data.color,
    createdBoards: [],
    createdAt: Date.now(),
    isAnonymous: data.isAnonymous,
  });
}

export function convertFirebaseUser(firebaseUser: FirebaseUser | null): User | null {
  if (!firebaseUser) return null;

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName || 'Anonymous',
    emoji: getRandomEmoji(),
    color: getRandomColor(),
    createdBoards: [],
    createdAt: Date.now(),
    isAnonymous: firebaseUser.isAnonymous,
  };
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (firebaseUser) => {
    const user = convertFirebaseUser(firebaseUser);
    callback(user);
  });
}

export function getCurrentUser(): User | null {
  return convertFirebaseUser(auth.currentUser);
}
