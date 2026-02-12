'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Board } from '@/types/board';
import { getBoard } from '@/lib/firebase/database';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  getBoardShareCodeStorageKey,
  normalizeShareCode
} from '@/lib/utils/shareCode';

interface BoardContextType {
  board: Board | null;
  isOwner: boolean;
  canEdit: boolean;
  loading: boolean;
  error: string | null;
  refreshBoard: () => Promise<void>;
}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

interface BoardProviderProps {
  boardId: string;
  children: React.ReactNode;
}

function getBoardErrorMessage(
  boardData: Board,
  hasUser: boolean,
  isAnonymousUser: boolean
): string {
  if (isAnonymousUser) {
    return 'Sign in with Google to join shared boards.';
  }

  if (!hasUser) {
    return 'Sign in to open this board.';
  }

  if (boardData.metadata.isPublic) {
    return 'Access code required. Enter the code on the home page and try again.';
  }

  return 'This board is private.';
}

function canCurrentUserEditBoard(boardData: Board, currentUserId: string | null): boolean {
  if (currentUserId && boardData.metadata.createdBy === currentUserId) {
    return true;
  }

  return boardData.metadata.isPublic && boardData.metadata.allowSharedEditing !== false;
}

export function BoardProvider({ boardId, children }: BoardProviderProps) {
  const { user, loading: authLoading } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type BoardAccessResult =
    | { allowed: true; board: Board }
    | { allowed: false; message: string };

  const canAccessBoard = useCallback((boardData: Board): boolean => {
    const currentUserId = user?.id ?? null;
    if (currentUserId && boardData.metadata.createdBy === currentUserId) {
      return true;
    }

    if (!currentUserId || user?.isAnonymous) {
      return false;
    }

    if (!boardData.metadata.isPublic) {
      return false;
    }

    const requiredCode = normalizeShareCode(
      typeof boardData.metadata.shareCode === 'string' ? boardData.metadata.shareCode : ''
    );
    if (!requiredCode) {
      return true;
    }

    if (typeof window === 'undefined') {
      return false;
    }

    const codeFromUrl = normalizeShareCode(
      new URL(window.location.href).searchParams.get('code') ?? ''
    );
    const storageKey = getBoardShareCodeStorageKey(boardId);
    const codeFromStorage = normalizeShareCode(
      window.localStorage.getItem(storageKey) ?? ''
    );
    const isAuthorized = codeFromUrl === requiredCode || codeFromStorage === requiredCode;

    if (isAuthorized && codeFromStorage !== requiredCode) {
      window.localStorage.setItem(storageKey, requiredCode);
    }

    return isAuthorized;
  }, [boardId, user?.id, user?.isAnonymous]);

  const loadBoardWithAccessCheck = useCallback(async (): Promise<BoardAccessResult> => {
    const boardData = await getBoard(boardId);
    if (!boardData) {
      return { allowed: false, message: 'Board not found' };
    }

    if (!canAccessBoard(boardData)) {
      return {
        allowed: false,
        message: getBoardErrorMessage(
          boardData,
          Boolean(user?.id),
          Boolean(user?.isAnonymous)
        ),
      };
    }

    return { allowed: true, board: boardData };
  }, [boardId, canAccessBoard, user?.id, user?.isAnonymous]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let isCancelled = false;

    async function loadBoard() {
      try {
        setLoading(true);
        setError(null);

        const accessResult = await loadBoardWithAccessCheck();
        if (isCancelled) {
          return;
        }

        if (!accessResult.allowed) {
          setBoard(null);
          setError(accessResult.message);
          return;
        }

        setBoard(accessResult.board);
        setError(null);
      } catch (err) {
        if (isCancelled) {
          return;
        }
        console.error('Error loading board:', err);
        setBoard(null);
        setError('Failed to load board');
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadBoard();

    return () => {
      isCancelled = true;
    };
  }, [authLoading, loadBoardWithAccessCheck]);

  const refreshBoard = async () => {
    try {
      const accessResult = await loadBoardWithAccessCheck();
      if (!accessResult.allowed) {
        setBoard(null);
        setError(accessResult.message);
        return;
      }

      setBoard(accessResult.board);
      setError(null);
    } catch (err) {
      console.error('Error refreshing board:', err);
    }
  };

  const currentUserId = user?.id ?? null;
  const isOwner = Boolean(
    board &&
    currentUserId &&
    board.metadata.createdBy === currentUserId
  );
  const canEdit = board ? canCurrentUserEditBoard(board, currentUserId) : false;

  return (
    <BoardContext.Provider value={{ board, isOwner, canEdit, loading, error, refreshBoard }}>
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard() {
  const context = useContext(BoardContext);
  if (context === undefined) {
    throw new Error('useBoard must be used within a BoardProvider');
  }
  return context;
}
