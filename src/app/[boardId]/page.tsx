'use client';

import Link from 'next/link';
import { MouseEvent as ReactMouseEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useBoard } from '@/components/providers/BoardProvider';
import { BoardProvider } from '@/components/providers/BoardProvider';
import { CanvasProvider } from '@/components/canvas/CanvasProvider';
import { Canvas } from '@/components/canvas/Canvas';
import { Toolbar } from '@/components/toolbar/Toolbar';
import { Loader } from '@/components/ui/Loader';
import { updateBoardSharing } from '@/lib/firebase/database';
import { formatShareCode, normalizeShareCode } from '@/lib/utils/shareCode';
import { Board } from '@/types/board';

import styles from './page.module.css';

export default function BoardPage({
  params,
}: {
  params: { boardId: string };
}) {
  const { boardId } = params;

  return (
    <BoardProvider boardId={boardId}>
      <CanvasProvider>
        <BoardView />
      </CanvasProvider>
    </BoardProvider>
  );
}

function BoardView() {
  const { user } = useAuth();
  const { board, loading, error, refreshBoard, canEdit } = useBoard();
  const isAnonymousUser = Boolean(user?.isAnonymous);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [updatingShareSettings, setUpdatingShareSettings] = useState(false);
  const [copiedShareCode, setCopiedShareCode] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<ShareModalState | null>(null);

  useEffect(() => {
    if (!board) {
      setShareState(null);
      return;
    }

    setShareState(getShareModalState(board));
  }, [board]);

  useEffect(() => {
    if (!shareModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shareModalOpen]);

  useEffect(() => {
    if (!shareModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || updatingShareSettings) {
        return;
      }

      setShareModalOpen(false);
      setCopiedShareCode(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [shareModalOpen, updatingShareSettings]);

  useEffect(() => {
    if (!copiedShareCode) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopiedShareCode(false);
    }, 1400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copiedShareCode]);

  const handleOpenShareModal = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();

    if (isAnonymousUser) {
      setShareError('Sign in with Google to share boards.');
      return;
    }

    if (!board) {
      return;
    }

    setShareError(null);
    setCopiedShareCode(false);
    setShareState(getShareModalState(board));
    setShareModalOpen(true);
  };

  const handleCloseShareModal = useCallback(() => {
    if (updatingShareSettings) {
      return;
    }

    setShareModalOpen(false);
    setCopiedShareCode(false);
  }, [updatingShareSettings]);

  const handleUpdateBoardSharing = useCallback(async (
    nextPublicState: boolean,
    nextAllowSharedEditing?: boolean
  ) => {
    if (isAnonymousUser) {
      setShareError('Sign in with Google to share boards.');
      return;
    }

    if (!board || !user?.id || updatingShareSettings) {
      return;
    }

    setUpdatingShareSettings(true);
    setShareError(null);

    try {
      const sharingState = await updateBoardSharing(
        board.metadata.id,
        user.id,
        nextPublicState,
        isAnonymousUser,
        nextAllowSharedEditing
      );

      setShareState({
        isPublic: sharingState.isPublic,
        shareCode: resolveBoardShareCode(sharingState.shareCode),
        allowSharedEditing: resolveAllowSharedEditing(sharingState.allowSharedEditing),
      });

      if (!sharingState.shareCode) {
        setCopiedShareCode(false);
      }

      await refreshBoard();
    } catch (shareException: unknown) {
      console.error('Error updating board sharing:', shareException);
      setShareError(parseErrorMessage(shareException, 'Failed to update board sharing'));
    } finally {
      setUpdatingShareSettings(false);
    }
  }, [board, isAnonymousUser, refreshBoard, updatingShareSettings, user?.id]);

  const handleCopyShareCode = useCallback(async (shareCode: string) => {
    setShareError(null);

    try {
      await copyTextToClipboard(shareCode);
      setCopiedShareCode(true);
    } catch (copyException: unknown) {
      console.error('Error copying share code:', copyException);
      setShareError(parseErrorMessage(copyException, 'Failed to copy share code'));
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.statusScreen}>
        <div className={styles.statusCard}>
          <Loader size="lg" />
          <p className={styles.statusText}>Loading board...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.statusScreen}>
        <div className={styles.statusCard}>
          <h1 className={styles.statusTitle}>Unable to open board</h1>
          <p className={styles.statusText}>{error}</p>
          <Link href="/" className={styles.statusLink}>
            Go to home
          </Link>
        </div>
      </div>
    );
  }

  const boardTitle = board?.metadata.title?.trim() || 'Untitled Board';
  const shareModalCode = shareState?.shareCode ?? null;
  const shareModalCodeFormatted = shareModalCode ? formatShareCode(shareModalCode) : '';
  const isPublic = Boolean(shareState?.isPublic);
  const allowSharedEditing = shareState?.allowSharedEditing ?? true;

  return (
    <div className={styles.page}>
      <div className={styles.shareIslandContainer}>
        <button
          type="button"
          className={styles.shareIslandButton}
          onClick={handleOpenShareModal}
          data-tooltip={isAnonymousUser ? 'Sign in to share' : 'Share'}
          aria-label={isAnonymousUser ? `Sign in with Google to share ${boardTitle}` : `Share ${boardTitle}`}
        >
          ↗
        </button>
        {shareError && !shareModalOpen && (
          <p className={styles.shareIslandError} role="alert">
            {shareError}
          </p>
        )}
      </div>

      {canEdit ? (
        <Toolbar />
      ) : (
        <div className={styles.readOnlyBadge} role="status" aria-live="polite">
          View-only mode
        </div>
      )}

      <main className={styles.main}>
        <Canvas />
      </main>

      {shareModalOpen && board && shareState && (
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
                <p className={styles.shareModalSubtitle}>{boardTitle}</p>
              </div>
              <button
                type="button"
                className={styles.shareModalClose}
                onClick={handleCloseShareModal}
                disabled={updatingShareSettings}
              >
                Close
              </button>
            </div>

            <div className={styles.shareModalBody}>
              <p className={styles.shareModalText}>
                Make this board public to generate an access code and control whether guests can edit.
              </p>

              {shareError && (
                <p className={styles.shareModalError} role="alert">
                  {shareError}
                </p>
              )}

              <button
                type="button"
                className={`${styles.shareVisibilityButton} ${isPublic ? styles.shareVisibilityPublic : styles.shareVisibilityPrivate}`}
                onClick={() => {
                  void handleUpdateBoardSharing(!isPublic, allowSharedEditing);
                }}
                disabled={updatingShareSettings}
              >
                {updatingShareSettings
                  ? 'Updating...'
                  : isPublic
                    ? 'Public (click to make private)'
                    : 'Private (click to make public)'}
              </button>

              {isPublic && (
                <>
                  <button
                    type="button"
                    className={`${styles.shareEditPermissionButton} ${
                      allowSharedEditing
                        ? styles.shareEditPermissionEnabled
                        : styles.shareEditPermissionDisabled
                    }`}
                    onClick={() => {
                      void handleUpdateBoardSharing(true, !allowSharedEditing);
                    }}
                    disabled={updatingShareSettings}
                  >
                    {updatingShareSettings
                      ? 'Updating...'
                      : allowSharedEditing
                        ? 'Guests can edit (click to make view-only)'
                        : 'Guests view-only (click to allow editing)'}
                  </button>
                  <p className={styles.shareEditPermissionHint}>
                    Owners can always edit. This setting applies to anyone joining with the share
                    code.
                  </p>
                </>
              )}

              {isPublic && shareModalCode && (
                <div className={styles.shareCodePanel}>
                  <p className={styles.shareCodeLabel}>Access code</p>
                  <div className={styles.shareCodeRow}>
                    <code className={styles.shareCodeValue}>{shareModalCodeFormatted}</code>
                    <button
                      type="button"
                      className={styles.shareCodeCopyButton}
                      onClick={() => {
                        void handleCopyShareCode(shareModalCode);
                      }}
                      disabled={updatingShareSettings}
                    >
                      {copiedShareCode ? 'Copied' : 'Copy code'}
                    </button>
                  </div>
                  <p className={styles.shareCodeHint}>
                    The other user can enter this code on their dashboard to open this board.
                  </p>
                </div>
              )}

              {!isPublic && (
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

interface ShareModalState {
  isPublic: boolean;
  shareCode: string | null;
  allowSharedEditing: boolean;
}

function getShareModalState(board: Board): ShareModalState {
  return {
    isPublic: Boolean(board.metadata.isPublic),
    shareCode: resolveBoardShareCode(board.metadata.shareCode),
    allowSharedEditing: resolveAllowSharedEditing(board.metadata.allowSharedEditing),
  };
}

function parseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    if (
      error.message.includes('client is offline') ||
      error.message.includes('offline')
    ) {
      return 'You are offline. Reconnect to sync board changes.';
    }

    return error.message;
  }

  return fallback;
}

function resolveBoardShareCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedCode = normalizeShareCode(value);
  return normalizedCode.length > 0 ? normalizedCode : null;
}

function resolveAllowSharedEditing(value: unknown): boolean {
  return value !== false;
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
