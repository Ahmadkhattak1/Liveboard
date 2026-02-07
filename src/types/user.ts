export interface User {
  id: string;
  email: string | null;
  displayName: string;
  emoji: string;
  color: string;
  createdBoards: string[];
  createdAt: number;
  isAnonymous: boolean;
}

export interface UserProfile {
  displayName: string;
  emoji: string;
  color: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials extends LoginCredentials {
  displayName: string;
}
