'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Board } from '@/types/board';
import { getBoard, subscribeToBoard } from '@/lib/firebase/database';

interface BoardContextType {
  board: Board | null;
  loading: boolean;
  error: string | null;
  refreshBoard: () => Promise<void>;
}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

interface BoardProviderProps {
  boardId: string;
  children: React.ReactNode;
}

export function BoardProvider({ boardId, children }: BoardProviderProps) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function loadBoard() {
      try {
        setLoading(true);
        setError(null);

        const boardData = await getBoard(boardId);
        if (!boardData) {
          setError('Board not found');
          setLoading(false);
          return;
        }

        setBoard(boardData);

        unsubscribe = subscribeToBoard(boardId, (updatedBoard) => {
          setBoard(updatedBoard);
        });

        setLoading(false);
      } catch (err) {
        console.error('Error loading board:', err);
        setError('Failed to load board');
        setLoading(false);
      }
    }

    loadBoard();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [boardId]);

  const refreshBoard = async () => {
    try {
      const boardData = await getBoard(boardId);
      if (boardData) {
        setBoard(boardData);
      }
    } catch (err) {
      console.error('Error refreshing board:', err);
    }
  };

  return (
    <BoardContext.Provider value={{ board, loading, error, refreshBoard }}>
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
