'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { get, ref } from 'firebase/database';
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { createBoard, deleteBoardForUser, updateBoardEmoji } from '@/lib/firebase/database';
import { database } from '@/lib/firebase/config';
import { loginAnonymously, loginWithGoogle } from '@/lib/firebase/auth';
import { getRandomBoardEmoji } from '@/lib/constants/tools';
import { Loader } from '@/components/ui/Loader';
import { Board } from '@/types/board';
import styles from './page.module.css';
import { EmojiStyle, type EmojiClickData } from 'emoji-picker-react';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

interface BoardSummary {
  id: string;
  title: string;
  emoji: string;
  updatedAt: number;
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

function formatUpdatedTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'just now';
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }

  if (diffMs < 7 * day) {
    return `${Math.floor(diffMs / day)}d ago`;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function parseErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;

  if (message.includes('popup-closed-by-user')) {
    return 'Google sign-in was cancelled before completion.';
  }

  if (message.includes('popup-blocked')) {
    return 'Google sign-in popup was blocked. Allow popups and try again.';
  }

  if (message.includes('operation-not-allowed')) {
    return 'Google sign-in is not enabled in Firebase Authentication.';
  }

  if (message.includes('admin-restricted-operation')) {
    return 'Anonymous auth is disabled in Firebase. Enable Authentication -> Sign-in method -> Anonymous.';
  }

  if (message.includes('permission')) {
    return 'Database permission denied. Check your Firebase Realtime Database rules.';
  }

  return message;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is unavailable in this environment.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Unable to copy board link.');
  }
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [emojiModalBoardId, setEmojiModalBoardId] = useState<string | null>(null);
  const [updatingEmojiBoardId, setUpdatingEmojiBoardId] = useState<string | null>(null);
  const [edgeActionBoardId, setEdgeActionBoardId] = useState<string | null>(null);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [copiedBoardId, setCopiedBoardId] = useState<string | null>(null);
  const [authAction, setAuthAction] = useState<'anonymous' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edgeRevealTimeoutRef = useRef<number | null>(null);
  const edgeRevealBoardRef = useRef<string | null>(null);
  const edgeHideTimeoutRef = useRef<number | null>(null);
  const edgeHideBoardRef = useRef<string | null>(null);

  useEffect(() => {
    if (!emojiModalBoardId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [emojiModalBoardId]);

  useEffect(() => {
    if (!emojiModalBoardId) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || updatingEmojiBoardId) {
        return;
      }
      setEmojiModalBoardId(null);
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [emojiModalBoardId, updatingEmojiBoardId]);

  useEffect(() => {
    if (!copiedBoardId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopiedBoardId(null);
    }, 1400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copiedBoardId]);

  useEffect(() => {
    return () => {
      if (edgeRevealTimeoutRef.current !== null) {
        window.clearTimeout(edgeRevealTimeoutRef.current);
      }
      if (edgeHideTimeoutRef.current !== null) {
        window.clearTimeout(edgeHideTimeoutRef.current);
      }
    };
  }, []);

  const loadBoards = useCallback(async (userId: string) => {
    setLoadingBoards(true);
    setError(null);

    try {
      const userBoardsRef = ref(database, `users/${userId}/createdBoards`);
      const userBoardsSnapshot = await get(userBoardsRef);
      const boardIds = userBoardsSnapshot.exists()
        ? normalizeBoardIds(userBoardsSnapshot.val())
        : [];
      const uniqueBoardIds = Array.from(new Set(boardIds));

      if (uniqueBoardIds.length === 0) {
        setBoards([]);
        return;
      }

      const boardSummaries = await Promise.all(
        uniqueBoardIds.map(async (boardId) => {
          const boardRef = ref(database, `boards/${boardId}`);
          const boardSnapshot = await get(boardRef);

          if (!boardSnapshot.exists()) {
            return null;
          }

          const board = boardSnapshot.val() as Board;
          const randomEmoji = getRandomBoardEmoji();
          const emoji = board.metadata.emoji || randomEmoji;

          if (!board.metadata.emoji) {
            try {
              await updateBoardEmoji(boardId, emoji);
            } catch (emojiError) {
              console.warn('Unable to auto-assign board emoji:', emojiError);
            }
          }

          return {
            id: boardId,
            title: board.metadata.title?.trim() || 'Untitled Board',
            emoji,
            updatedAt: board.metadata.updatedAt || board.metadata.createdAt,
          };
        })
      );

      setBoards(
        boardSummaries
          .filter((board): board is BoardSummary => board !== null)
          .sort((first, second) => second.updatedAt - first.updatedAt)
      );
    } catch (loadError: unknown) {
      console.error('Error loading boards:', loadError);
      setError(parseErrorMessage(loadError, 'Failed to load boards'));
    } finally {
      setLoadingBoards(false);
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user?.id) {
      if (signingIn) {
        setSigningIn(false);
        setAuthAction(null);
      }

      if (user.id === activeUserId && (!initializing || loadingBoards)) {
        return;
      }

      setActiveUserId(user.id);
      void loadBoards(user.id);
      return;
    }

    setActiveUserId(null);
    setBoards([]);
    setInitializing(false);
  }, [activeUserId, initializing, loadBoards, loading, loadingBoards, signingIn, user?.id]);

  const handleAuthChoice = async (mode: 'anonymous' | 'google') => {
    if (signingIn) {
      return;
    }

    setSigningIn(true);
    setAuthAction(mode);
    setError(null);
    setInitializing(true);

    try {
      if (mode === 'anonymous') {
        await loginAnonymously();
      } else {
        await loginWithGoogle();
      }
    } catch (signInError: unknown) {
      console.error('Authentication error:', signInError);
      setError(parseErrorMessage(signInError, 'Failed to authenticate user'));
      setSigningIn(false);
      setAuthAction(null);
      setInitializing(false);
    }
  };

  const handleCreateBoard = async () => {
    if (!activeUserId || creatingBoard) {
      return;
    }

    setCreatingBoard(true);
    setError(null);

    try {
      const boardId = await createBoard(activeUserId);
      router.push(`/${boardId}`);
    } catch (createError: unknown) {
      console.error('Error creating board:', createError);
      setError(parseErrorMessage(createError, 'Failed to create board'));
    } finally {
      setCreatingBoard(false);
    }
  };

  const handleRetryBoards = () => {
    if (!activeUserId || loadingBoards) {
      return;
    }

    void loadBoards(activeUserId);
  };

  const handleOpenEmojiModal = (
    boardId: string,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    setEmojiModalBoardId(boardId);
  };

  const handleCloseEmojiModal = () => {
    if (updatingEmojiBoardId) {
      return;
    }
    setEmojiModalBoardId(null);
  };

  const handleSelectBoardEmoji = async (
    boardId: string,
    emojiData: EmojiClickData
  ) => {
    if (updatingEmojiBoardId) {
      return;
    }

    const { emoji } = emojiData;
    setUpdatingEmojiBoardId(boardId);
    setError(null);

    try {
      await updateBoardEmoji(boardId, emoji);
      setBoards((currentBoards) =>
        currentBoards.map((board) =>
          board.id === boardId ? { ...board, emoji } : board
        )
      );
      setEmojiModalBoardId(null);
    } catch (emojiError: unknown) {
      console.error('Error updating board emoji:', emojiError);
      setError(parseErrorMessage(emojiError, 'Failed to update board emoji'));
    } finally {
      setUpdatingEmojiBoardId(null);
    }
  };

  const clearEdgeRevealTimer = () => {
    if (edgeRevealTimeoutRef.current !== null) {
      window.clearTimeout(edgeRevealTimeoutRef.current);
      edgeRevealTimeoutRef.current = null;
    }
    edgeRevealBoardRef.current = null;
  };

  const clearEdgeHideTimer = () => {
    if (edgeHideTimeoutRef.current !== null) {
      window.clearTimeout(edgeHideTimeoutRef.current);
      edgeHideTimeoutRef.current = null;
    }
    edgeHideBoardRef.current = null;
  };

  const scheduleEdgeReveal = (boardId: string) => {
    if (
      edgeRevealTimeoutRef.current !== null &&
      edgeRevealBoardRef.current === boardId
    ) {
      return;
    }

    clearEdgeHideTimer();
    clearEdgeRevealTimer();
    edgeRevealBoardRef.current = boardId;
    edgeRevealTimeoutRef.current = window.setTimeout(() => {
      setEdgeActionBoardId(boardId);
      edgeRevealTimeoutRef.current = null;
      edgeRevealBoardRef.current = null;
    }, 200);
  };

  const scheduleEdgeHide = (boardId: string) => {
    if (
      edgeHideTimeoutRef.current !== null &&
      edgeHideBoardRef.current === boardId
    ) {
      return;
    }

    clearEdgeHideTimer();
    edgeHideBoardRef.current = boardId;
    edgeHideTimeoutRef.current = window.setTimeout(() => {
      setEdgeActionBoardId((current) => (current === boardId ? null : current));
      edgeHideTimeoutRef.current = null;
      edgeHideBoardRef.current = null;
    }, 90);
  };

  const handleBoardMouseMove = (
    boardId: string,
    event: ReactMouseEvent<HTMLElement>
  ) => {
    const rowElement = event.currentTarget;
    const boardCardElement = event.currentTarget.querySelector<HTMLElement>(
      `[data-board-card="${boardId}"]`
    );
    const openBoardElement = event.currentTarget.querySelector<HTMLElement>(
      `[data-open-board-for="${boardId}"]`
    );
    const edgeActionsElement = event.currentTarget.querySelector<HTMLElement>(
      `[data-edge-actions-for="${boardId}"]`
    );
    const eventTarget = event.target;

    if (!boardCardElement || !(eventTarget instanceof Element)) {
      return;
    }

    const rowRect = rowElement.getBoundingClientRect();
    const openRect = openBoardElement?.getBoundingClientRect();
    const edgeActionsRect = edgeActionsElement?.getBoundingClientRect();
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const isActiveBoard = edgeActionBoardId === boardId;
    const isOverOpenButton = Boolean(
      openRect &&
      pointerX >= openRect.left &&
      pointerX <= openRect.right &&
      pointerY >= openRect.top &&
      pointerY <= openRect.bottom
    );
    const isOverEdgeActions = Boolean(
      edgeActionsRect &&
      pointerX >= edgeActionsRect.left &&
      pointerX <= edgeActionsRect.right &&
      pointerY >= edgeActionsRect.top &&
      pointerY <= edgeActionsRect.bottom
    );

    if (isOverEdgeActions || eventTarget.closest(`[data-edge-actions-for="${boardId}"]`)) {
      clearEdgeHideTimer();
      clearEdgeRevealTimer();
      setEdgeActionBoardId(boardId);
      return;
    }

    if (isOverOpenButton || eventTarget.closest(`[data-open-board-for="${boardId}"]`)) {
      if (edgeRevealBoardRef.current === boardId) {
        clearEdgeRevealTimer();
      }
      clearEdgeHideTimer();
      setEdgeActionBoardId((current) => (current === boardId ? null : current));
      return;
    }

    const triggerMinX = (openRect?.right ?? (rowRect.right - 118)) + 6;
    const triggerMaxX = rowRect.right + (isActiveBoard ? 66 : 34);
    const isWithinVerticalBounds =
      pointerY >= rowRect.top - 8 && pointerY <= rowRect.bottom + 8;
    const isInsideRightTriggerLane =
      isWithinVerticalBounds &&
      pointerX >= triggerMinX &&
      pointerX <= triggerMaxX;

    if (isInsideRightTriggerLane) {
      clearEdgeHideTimer();
      if (!isActiveBoard) {
        scheduleEdgeReveal(boardId);
      }
      return;
    }

    if (edgeRevealBoardRef.current === boardId) {
      clearEdgeRevealTimer();
    }

    if (isActiveBoard) {
      scheduleEdgeHide(boardId);
    }
  };

  const handleBoardMouseLeave = (boardId: string) => {
    if (edgeRevealBoardRef.current === boardId) {
      clearEdgeRevealTimer();
    }
    if (edgeHideBoardRef.current === boardId) {
      clearEdgeHideTimer();
    }
    setEdgeActionBoardId((current) => (current === boardId ? null : current));
  };

  const handleShareBoard = async (
    boardId: string,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
    setError(null);

    try {
      const boardUrl = `${window.location.origin}/${boardId}`;
      await copyTextToClipboard(boardUrl);
      setCopiedBoardId(boardId);
    } catch (shareError: unknown) {
      console.error('Error sharing board:', shareError);
      setError(parseErrorMessage(shareError, 'Failed to copy board link'));
    }
  };

  const handleDeleteBoard = async (
    boardId: string,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    if (!activeUserId || deletingBoardId) {
      return;
    }

    const boardToDelete = boards.find((board) => board.id === boardId);
    const confirmDelete = window.confirm(
      `Delete "${boardToDelete?.title || 'Untitled Board'}"? This cannot be undone.`
    );

    if (!confirmDelete) {
      return;
    }

    setDeletingBoardId(boardId);
    setError(null);

    try {
      await deleteBoardForUser(activeUserId, boardId);
      setBoards((currentBoards) =>
        currentBoards.filter((board) => board.id !== boardId)
      );
      setEdgeActionBoardId((current) => (current === boardId ? null : current));
      setCopiedBoardId((current) => (current === boardId ? null : current));
      setEmojiModalBoardId((current) => (current === boardId ? null : current));
    } catch (deleteError: unknown) {
      console.error('Error deleting board:', deleteError);
      setError(parseErrorMessage(deleteError, 'Failed to delete board'));
    } finally {
      setDeletingBoardId(null);
    }
  };

  const emojiModalBoard = emojiModalBoardId
    ? boards.find((board) => board.id === emojiModalBoardId)
    : null;

  const showInitialLoader =
    loading ||
    signingIn ||
    (Boolean(user?.id) && initializing && boards.length === 0);

  if (showInitialLoader) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingContent}>
          <Loader size="lg" />
          <p className={styles.loadingText}>
            {authAction === 'google' ? 'Signing in with Google...' : 'Loading your boards...'}
          </p>
        </div>
      </div>
    );
  }

  const showAuthChoice = !loading && !user && !signingIn;

  if (showAuthChoice) {
    return (
      <div className={styles.authGate}>
        <div className={styles.authCard}>
          <p className={styles.authEyebrow}>Liveboard</p>
          <h1 className={styles.authTitle}>How do you want to start?</h1>
          <p className={styles.authText}>
            Continue as an anonymous guest or create an account with Google.
          </p>

          {error && <p className={styles.authError}>{error}</p>}

          <div className={styles.authActions}>
            <button
              type="button"
              className={styles.authSecondary}
              onClick={() => handleAuthChoice('anonymous')}
            >
              Stay anonymous
            </button>
            <button
              type="button"
              className={styles.authPrimary}
              onClick={() => handleAuthChoice('google')}
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.actionIsland}>
        <button
          type="button"
          className={styles.createButton}
          onClick={handleCreateBoard}
          disabled={!activeUserId || creatingBoard}
        >
          {creatingBoard ? 'Creating board...' : 'Create new board'}
        </button>
      </div>

      <div className={styles.profileIsland}>
        <span className={styles.profileName}>{user?.displayName || 'Anonymous'}</span>
        <span className={styles.profileType}>
          {user?.isAnonymous ? 'Guest profile' : 'Google profile'}
        </span>
      </div>

      <main className={styles.main}>
        {error && (
          <div className={styles.errorBanner}>
            <p>{error}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={handleRetryBoards}
              disabled={!activeUserId || loadingBoards}
            >
              Retry
            </button>
          </div>
        )}

        {boards.length === 0 ? (
          <section className={styles.emptyPanel}>
            <h2 className={styles.emptyTitle}>No boards yet</h2>
            <p className={styles.emptyText}>
              Create your first board and it will appear here as your default landing page.
            </p>
            <button
              type="button"
              className={styles.emptyButton}
              onClick={handleCreateBoard}
              disabled={!activeUserId || creatingBoard}
            >
              {creatingBoard ? 'Creating board...' : 'Create your first board'}
            </button>
          </section>
        ) : (
          <section className={styles.cardStack}>
            {boards.map((board, index) => {
              const toneClass = index % 3 === 0
                ? styles.toneBlue
                : index % 3 === 1
                  ? styles.toneYellow
                  : styles.toneTeal;
              const isEdgeActionVisible = edgeActionBoardId === board.id;
              const isDeletingBoard = deletingBoardId === board.id;
              const isShareCopied = copiedBoardId === board.id;

              return (
                <div
                  className={`${styles.boardRow} ${isEdgeActionVisible ? styles.boardRowEdgeActive : ''}`}
                  key={board.id}
                  onMouseMove={(event) => handleBoardMouseMove(board.id, event)}
                  onMouseLeave={() => handleBoardMouseLeave(board.id)}
                >
                  <article className={`${styles.boardCard} ${toneClass}`} data-board-card={board.id}>
                    <div className={styles.cardContent}>
                      <div className={styles.cardMain}>
                        <div className={styles.titleRow}>
                          <div className={styles.emojiPickerWrap}>
                            <button
                              type="button"
                              className={styles.emojiBadge}
                              onClick={(event) => handleOpenEmojiModal(board.id, event)}
                              aria-label={`Change emoji for ${board.title}`}
                            >
                              {board.emoji}
                            </button>
                          </div>
                          <div className={styles.titleBlock}>
                            <h2 className={styles.cardTitle}>{board.title}</h2>
                            <p className={styles.updatedText}>Updated {formatUpdatedTime(board.updatedAt)}</p>
                          </div>
                        </div>
                      </div>

                      <div className={styles.cardSide}>
                        <Link
                          className={styles.openButton}
                          href={`/${board.id}`}
                          data-open-board-for={board.id}
                        >
                          Open board
                        </Link>
                      </div>
                    </div>
                  </article>

                  <div className={styles.edgeTriggerZone} aria-hidden="true" />

                  <div className={styles.edgeActions} data-edge-actions-for={board.id}>
                    <button
                      type="button"
                      className={`${styles.edgeActionButton} ${styles.edgeActionShare}`}
                      onClick={(event) => {
                        void handleShareBoard(board.id, event);
                      }}
                      data-tooltip={isShareCopied ? 'Copied' : 'Share'}
                      aria-label={`Share ${board.title}`}
                    >
                      {isShareCopied ? '✓' : '↗'}
                    </button>
                    <button
                      type="button"
                      className={`${styles.edgeActionButton} ${styles.edgeActionDelete}`}
                      onClick={(event) => {
                        void handleDeleteBoard(board.id, event);
                      }}
                      disabled={isDeletingBoard || deletingBoardId !== null}
                      data-tooltip="Delete"
                      aria-label={`Delete ${board.title}`}
                    >
                      {isDeletingBoard ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {loadingBoards && boards.length > 0 && (
          <div className={styles.refreshingRow}>Updating board list...</div>
        )}
      </main>

      {emojiModalBoardId && (
        <div className={styles.emojiModalBackdrop} onClick={handleCloseEmojiModal}>
          <div
            className={styles.emojiModalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose board emoji"
          >
            <div className={styles.emojiModalHeader}>
              <div>
                <h3 className={styles.emojiModalTitle}>Choose board emoji</h3>
                {emojiModalBoard && (
                  <p className={styles.emojiModalSubtitle}>{emojiModalBoard.title}</p>
                )}
              </div>
              <button
                type="button"
                className={styles.emojiModalClose}
                onClick={handleCloseEmojiModal}
                disabled={Boolean(updatingEmojiBoardId)}
              >
                Close
              </button>
            </div>
            <EmojiPicker
              width="100%"
              height={360}
              searchPlaceholder="Search all emojis"
              lazyLoadEmojis
              autoFocusSearch
              emojiStyle={EmojiStyle.NATIVE}
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emojiData) => {
                void handleSelectBoardEmoji(emojiModalBoardId, emojiData);
              }}
              className={styles.emojiModalPicker}
            />
          </div>
        </div>
      )}
    </div>
  );
}
