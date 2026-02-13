'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthState } from '@/types/user';
import { ensureAuthPersistence, onAuthStateChange, getCurrentUser } from '@/lib/firebase/auth';

interface AuthContextType extends AuthState {
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let unsubscribe = () => {};
    let isUnmounted = false;

    void ensureAuthPersistence().then(() => {
      if (isUnmounted) {
        return;
      }

      unsubscribe = onAuthStateChange((user) => {
        setAuthState({
          user,
          loading: false,
          error: null,
        });
      });
    });

    return () => {
      isUnmounted = true;
      unsubscribe();
    };
  }, []);

  const refreshUser = () => {
    const user = getCurrentUser();
    setAuthState((prev) => ({
      ...prev,
      user,
    }));
  };

  return (
    <AuthContext.Provider value={{ ...authState, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
