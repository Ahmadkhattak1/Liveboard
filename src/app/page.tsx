'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FormEvent as ReactFormEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  createBoard,
  deleteBoardForUser,
  findPublicBoardByShareCode,
  getBoard,
  getUserBoardIds,
  updateBoardEmoji,
  updateBoardSharing
} from '@/lib/firebase/database';
import {
  loginAnonymously,
  loginWithGoogle,
  signOut as logoutUser
} from '@/lib/firebase/auth';
import { getRandomBoardEmoji } from '@/lib/constants/tools';
import {
  formatShareCode,
  getBoardShareCodeStorageKey,
  normalizeShareCode
} from '@/lib/utils/shareCode';
import { Loader } from '@/components/ui/Loader';
import styles from './page.module.css';
import { EmojiStyle, type EmojiClickData } from 'emoji-picker-react';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

interface BoardSummary {
  id: string;
  title: string;
  emoji: string;
  updatedAt: number;
  isPublic: boolean;
  shareCode: string | null;
  allowSharedEditing: boolean;
}

function resolveBoardShareCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizeShareCode(value);
  return normalized.length > 0 ? normalized : null;
}

function resolveAllowSharedEditing(value: unknown): boolean {
  return value !== false;
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
    return 'Database permission denied. Check your Firestore and Realtime Database rules.';
  }

  if (
    message.includes('client is offline') ||
    message.includes('offline')
  ) {
    return 'You are offline. Reconnect to sync your latest data.';
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
    throw new Error('Unable to copy text.');
  }
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [joiningBoardByCode, setJoiningBoardByCode] = useState(false);
  const [emojiModalBoardId, setEmojiModalBoardId] = useState<string | null>(null);
  const [updatingEmojiBoardId, setUpdatingEmojiBoardId] = useState<string | null>(null);
  const [shareModalBoardId, setShareModalBoardId] = useState<string | null>(null);
  const [updatingShareBoardId, setUpdatingShareBoardId] = useState<string | null>(null);
  const [copiedShareCodeBoardId, setCopiedShareCodeBoardId] = useState<string | null>(null);
  const [edgeActionBoardId, setEdgeActionBoardId] = useState<string | null>(null);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [authAction, setAuthAction] = useState<'anonymous' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signInPromptMessage, setSignInPromptMessage] = useState<string | null>(null);
  const edgeRevealTimeoutRef = useRef<number | null>(null);
  const edgeRevealBoardRef = useRef<string | null>(null);
  const edgeHideTimeoutRef = useRef<number | null>(null);
  const edgeHideBoardRef = useRef<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const hasModalOpen = Boolean(emojiModalBoardId || shareModalBoardId);
  const isAnonymousUser = Boolean(user?.isAnonymous);

  useEffect(() => {
    if (!hasModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasModalOpen]);

  useEffect(() => {
    if (!hasModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (updatingEmojiBoardId || updatingShareBoardId) {
        return;
      }

      if (shareModalBoardId) {
        setShareModalBoardId(null);
        return;
      }

      if (!emojiModalBoardId) {
        return;
      }

      setEmojiModalBoardId(null);
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [emojiModalBoardId, hasModalOpen, shareModalBoardId, updatingEmojiBoardId, updatingShareBoardId]);

  useEffect(() => {
    if (!copiedShareCodeBoardId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopiedShareCodeBoardId(null);
    }, 1400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copiedShareCodeBoardId]);

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

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (profileMenuRef.current?.contains(event.target)) {
        return;
      }

      setProfileMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (user?.id) {
      return;
    }

    setProfileMenuOpen(false);
  }, [user?.id]);

  useEffect(() => {
    if (!isAnonymousUser) {
      setSignInPromptMessage(null);
    }
  }, [isAnonymousUser]);

  const loadBoards = useCallback(async (userId: string) => {
    setLoadingBoards(true);
    setError(null);

    try {
      const boardIds = await getUserBoardIds(userId);
      const uniqueBoardIds = Array.from(new Set(boardIds));

      if (uniqueBoardIds.length === 0) {
        setBoards([]);
        return;
      }

      const boardSummaries = await Promise.all(
        uniqueBoardIds.map(async (boardId) => {
          const board = await getBoard(boardId);
          if (!board) {
            return null;
          }
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
            isPublic: Boolean(board.metadata.isPublic),
            shareCode: resolveBoardShareCode(board.metadata.shareCode),
            allowSharedEditing: resolveAllowSharedEditing(board.metadata.allowSharedEditing),
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

    setProfileMenuOpen(false);
    setSignInPromptMessage(null);
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
      // Sign-in (and any account migration) is now complete.
      // Reset activeUserId so the useEffect triggers a fresh loadBoards.
      // This is needed because onAuthStateChanged may have fired mid-migration
      // and loaded stale board data before the merge finished.
      setActiveUserId(null);
    } catch (signInError: unknown) {
      console.error('Authentication error:', signInError);
      setError(parseErrorMessage(signInError, 'Failed to authenticate user'));
      setSigningIn(false);
      setAuthAction(null);
      setInitializing(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }

    setProfileMenuOpen(false);
    setSigningOut(true);
    setError(null);

    try {
      await logoutUser();
    } catch (signOutError: unknown) {
      console.error('Sign-out error:', signOutError);
      setError(parseErrorMessage(signOutError, 'Failed to sign out'));
    } finally {
      setSigningOut(false);
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

  const handleJoinBoardByCode = async (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isAnonymousUser) {
      setError(null);
      setSignInPromptMessage('Sign in with Google to join shared boards.');
      return;
    }

    setSignInPromptMessage(null);
    const normalizedCode = normalizeShareCode(joinCodeInput);
    if (!normalizedCode) {
      setError('Enter a valid share code.');
      return;
    }

    if (joiningBoardByCode) {
      return;
    }

    setJoiningBoardByCode(true);
    setError(null);

    try {
      const boardId = await findPublicBoardByShareCode(normalizedCode, isAnonymousUser);
      if (!boardId) {
        setError('No public board found for that share code.');
        return;
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          getBoardShareCodeStorageKey(boardId),
          normalizedCode
        );
      }

      router.push(`/${boardId}?code=${encodeURIComponent(normalizedCode)}`);
    } catch (joinError: unknown) {
      console.error('Error joining board by code:', joinError);
      setError(parseErrorMessage(joinError, 'Failed to join board with share code'));
    } finally {
      setJoiningBoardByCode(false);
    }
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

  const handleOpenShareModal = (
    boardId: string,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    if (isAnonymousUser) {
      setError(null);
      setSignInPromptMessage('Sign in with Google to share boards.');
      return;
    }

    setSignInPromptMessage(null);
    setError(null);
    setCopiedShareCodeBoardId(null);
    setShareModalBoardId(boardId);
  };

  const handleCloseShareModal = () => {
    if (updatingShareBoardId) {
      return;
    }

    setShareModalBoardId(null);
    setCopiedShareCodeBoardId(null);
  };

  const handleUpdateBoardSharing = async (
    boardId: string,
    nextPublicState: boolean,
    nextAllowSharedEditing?: boolean
  ) => {
    if (isAnonymousUser) {
      setError(null);
      setSignInPromptMessage('Sign in with Google to share boards.');
      return;
    }

    setSignInPromptMessage(null);
    if (!activeUserId || updatingShareBoardId) {
      return;
    }

    setUpdatingShareBoardId(boardId);
    setError(null);

    try {
      const sharingState = await updateBoardSharing(
        boardId,
        activeUserId,
        nextPublicState,
        isAnonymousUser,
        nextAllowSharedEditing
      );

      setBoards((currentBoards) =>
        currentBoards.map((board) =>
          board.id === boardId
            ? {
                ...board,
                isPublic: sharingState.isPublic,
                shareCode: sharingState.shareCode,
                allowSharedEditing: sharingState.allowSharedEditing,
              }
            : board
        )
      );

      if (!sharingState.shareCode) {
        setCopiedShareCodeBoardId(null);
      }
    } catch (shareError: unknown) {
      console.error('Error updating board sharing:', shareError);
      setError(parseErrorMessage(shareError, 'Failed to update board sharing'));
    } finally {
      setUpdatingShareBoardId(null);
    }
  };

  const handleCopyShareCode = async (
    boardId: string,
    shareCode: string
  ) => {
    setError(null);

    try {
      await copyTextToClipboard(shareCode);
      setCopiedShareCodeBoardId(boardId);
    } catch (copyError: unknown) {
      console.error('Error copying share code:', copyError);
      setError(parseErrorMessage(copyError, 'Failed to copy share code'));
    }
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

  const handleShareBoard = (
    boardId: string,
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    handleOpenShareModal(boardId, event);
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
      setCopiedShareCodeBoardId((current) => (current === boardId ? null : current));
      setEmojiModalBoardId((current) => (current === boardId ? null : current));
      setShareModalBoardId((current) => (current === boardId ? null : current));
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
  const shareModalBoard = shareModalBoardId
    ? boards.find((board) => board.id === shareModalBoardId)
    : null;
  const shareModalCode = shareModalBoard?.shareCode ?? null;
  const shareModalCodeFormatted = shareModalCode ? formatShareCode(shareModalCode) : '';
  const isShareCodeCopied =
    Boolean(shareModalBoardId) && copiedShareCodeBoardId === shareModalBoardId;
  const isUpdatingShareSettings =
    Boolean(shareModalBoardId) && updatingShareBoardId === shareModalBoardId;

  const showInitialLoader =
    loading ||
    signingIn ||
    signingOut ||
    (Boolean(user?.id) && initializing && boards.length === 0);

  if (showInitialLoader) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingContent}>
          <Loader size="lg" />
          <p className={styles.loadingText}>
            {signingOut
              ? 'Signing out...'
              : authAction === 'google'
                ? 'Signing in with Google...'
                : 'Loading your boards...'}
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

  const boardToneClasses = [
    styles.toneBlue,
    styles.toneYellow,
    styles.toneTeal,
    styles.toneCoral,
    styles.toneMint,
    styles.toneLavender,
  ];

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

      <div className={styles.profileIsland} ref={profileMenuRef}>
        <button
          type="button"
          className={styles.profileTriggerButton}
          onClick={() => {
            setProfileMenuOpen((current) => !current);
          }}
          aria-haspopup="menu"
          aria-expanded={profileMenuOpen}
          aria-controls="profile-menu"
        >
          <span className={styles.profileIdentity}>
            <span className={styles.profileName}>{user?.displayName || 'Anonymous'}</span>
            <span className={styles.profileType}>
              {user?.isAnonymous ? 'Guest profile' : 'Google profile'}
            </span>
          </span>
          <span className={styles.profileChevron} aria-hidden="true">
            {profileMenuOpen ? '▴' : '▾'}
          </span>
        </button>
        {profileMenuOpen && (
          <div
            id="profile-menu"
            className={styles.profileDropdown}
            role="menu"
            aria-label="Profile actions"
          >
            {isAnonymousUser && (
              <button
                type="button"
                className={`${styles.profileDropdownButton} ${styles.profileDropdownPrimary}`}
                onClick={() => {
                  void handleAuthChoice('google');
                }}
                role="menuitem"
                disabled={signingIn || signingOut}
              >
                Sign in with Google
              </button>
            )}
            <button
              type="button"
              className={styles.profileDropdownButton}
              onClick={() => {
                void handleSignOut();
              }}
              role="menuitem"
              disabled={signingOut}
            >
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        )}
      </div>

      <main className={styles.main}>
        {signInPromptMessage && (
          <div className={styles.shareSignInBanner}>
            <p>{signInPromptMessage}</p>
            <div className={styles.shareSignInActions}>
              <button
                type="button"
                className={styles.shareSignInButton}
                onClick={() => {
                  void handleAuthChoice('google');
                }}
                disabled={signingIn || signingOut}
              >
                Sign in with Google
              </button>
              <button
                type="button"
                className={styles.shareSignInDismissButton}
                onClick={() => {
                  setSignInPromptMessage(null);
                }}
                disabled={signingIn || signingOut}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

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

        <section className={styles.joinPanel}>
          <h2 className={styles.joinTitle}>Open a shared board</h2>
          <p className={styles.joinText}>Enter the access code from the board owner.</p>
          <form className={styles.joinForm} onSubmit={(event) => {
            void handleJoinBoardByCode(event);
          }}>
            <input
              type="text"
              value={joinCodeInput}
              onChange={(event) => {
                setJoinCodeInput(normalizeShareCode(event.target.value));
              }}
              className={styles.joinInput}
              placeholder="ABCD1234"
              aria-label="Board access code"
              maxLength={8}
              autoComplete="off"
              spellCheck={false}
              disabled={joiningBoardByCode}
            />
            <button
              type="submit"
              className={styles.joinButton}
              disabled={
                joiningBoardByCode ||
                joinCodeInput.trim().length === 0
              }
            >
              {joiningBoardByCode ? 'Joining...' : 'Join board'}
            </button>
          </form>
        </section>

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
            {boards.map((board) => {
              const toneClass = boardToneClasses[
                getStableIndexFromString(board.id, boardToneClasses.length)
              ];
              const isEdgeActionVisible = edgeActionBoardId === board.id;
              const isDeletingBoard = deletingBoardId === board.id;

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
                        handleShareBoard(board.id, event);
                      }}
                      data-tooltip={isAnonymousUser ? 'Sign in to share' : 'Share'}
                      aria-label={
                        isAnonymousUser
                          ? `Sign in with Google to share ${board.title}`
                          : `Share ${board.title}`
                      }
                    >
                      ↗
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

      <div className={styles.infoFab}>
        <button
          type="button"
          className={styles.infoFabButton}
          aria-label="What is this?"
        >
          ?
        </button>
        <div className={styles.infoPopover} role="note">
          <p className={styles.infoPopoverQuestion}>What is this?</p>
          <p className={styles.infoPopoverAnswer}>
            Liveboard is a freeform whiteboard to share ideas with teams or students
          </p>
        </div>
      </div>

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

      {shareModalBoardId && shareModalBoard && (
        <div className={styles.emojiModalBackdrop} onClick={handleCloseShareModal}>
          <div
            className={styles.shareModalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Share board"
          >
            <div className={styles.shareModalHeader}>
              <div>
                <h3 className={styles.shareModalTitle}>Share board</h3>
                <p className={styles.shareModalSubtitle}>{shareModalBoard.title}</p>
              </div>
              <button
                type="button"
                className={styles.shareModalClose}
                onClick={handleCloseShareModal}
                disabled={isUpdatingShareSettings}
              >
                Close
              </button>
            </div>

            <div className={styles.shareModalBody}>
              <p className={styles.shareModalText}>
                Make this board public to generate an access code and control whether guests can edit.
              </p>

              <div className={styles.shareChecklist}>
                <button
                  type="button"
                  className={styles.shareCheckRow}
                  onClick={() => {
                    void handleUpdateBoardSharing(
                      shareModalBoard.id,
                      !shareModalBoard.isPublic,
                      shareModalBoard.allowSharedEditing
                    );
                  }}
                  disabled={isUpdatingShareSettings}
                >
                  <span
                    className={`${styles.shareCheckMark} ${shareModalBoard.isPublic ? styles.shareCheckMarkActive : ''}`}
                    aria-hidden="true"
                  >
                    {shareModalBoard.isPublic ? '✓' : ''}
                  </span>
                  <span className={styles.shareCheckContent}>
                    <span className={styles.shareCheckLabel}>Public sharing</span>
                    <span className={styles.shareCheckHint}>
                      Anyone with the access code can open this board.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.shareCheckRow}
                  onClick={() => {
                    if (!shareModalBoard.isPublic) {
                      return;
                    }
                    void handleUpdateBoardSharing(
                      shareModalBoard.id,
                      true,
                      !shareModalBoard.allowSharedEditing
                    );
                  }}
                  disabled={!shareModalBoard.isPublic || isUpdatingShareSettings}
                >
                  <span
                    className={`${styles.shareCheckMark} ${
                      shareModalBoard.isPublic && shareModalBoard.allowSharedEditing
                        ? styles.shareCheckMarkActive
                        : ''
                    }`}
                    aria-hidden="true"
                  >
                    {shareModalBoard.isPublic && shareModalBoard.allowSharedEditing ? '✓' : ''}
                  </span>
                  <span className={styles.shareCheckContent}>
                    <span className={styles.shareCheckLabel}>Allow guest editing</span>
                    <span className={styles.shareCheckHint}>
                      {shareModalBoard.isPublic
                        ? 'Guests can draw and edit when this is checked.'
                        : 'Enable public sharing first.'}
                    </span>
                  </span>
                </button>
              </div>

              {shareModalBoard.isPublic && shareModalCode && (
                <div className={styles.shareCodePanel}>
                  <p className={styles.shareCodeLabel}>Access code</p>
                  <div className={styles.shareCodeRow}>
                    <code className={styles.shareCodeValue}>{shareModalCodeFormatted}</code>
                    <button
                      type="button"
                      className={styles.shareCodeCopyButton}
                      onClick={() => {
                        void handleCopyShareCode(shareModalBoard.id, shareModalCode);
                      }}
                      disabled={isUpdatingShareSettings}
                    >
                      {isShareCodeCopied ? 'Copied' : 'Copy code'}
                    </button>
                  </div>
                  <p className={styles.shareCodeHint}>
                    The other user can enter this code on their dashboard to open this board.
                  </p>
                </div>
              )}

              {!shareModalBoard.isPublic && (
                <p className={styles.sharePrivateHint}>
                  This board is private and cannot be opened with a share code.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
