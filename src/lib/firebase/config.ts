import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Validate required environment variables
function validateFirebaseConfig() {
  const required = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error('Missing Firebase configuration:', missing.join(', '));
    throw new Error(
      `Missing Firebase environment variables: ${missing.join(', ')}. ` +
      'Please check your .env.local file.'
    );
  }

  // Validate database URL format
  const dbUrl = required.databaseURL;
  if (dbUrl && !dbUrl.startsWith('https://') && !dbUrl.endsWith('.firebaseio.com')) {
    console.error('Invalid Firebase Database URL format:', dbUrl);
    console.error('Expected format: https://your-project-id-default-rtdb.firebaseio.com');
    throw new Error(
      'Invalid Firebase Database URL. Expected format: https://your-project-id-default-rtdb.firebaseio.com'
    );
  }

  return required;
}

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let database: Database;
let storage: FirebaseStorage;

if (typeof window !== 'undefined') {
  try {
    const firebaseConfig = validateFirebaseConfig();
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    database = getDatabase(app);
    storage = getStorage(app);
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
}

export { app, auth, database, storage };
