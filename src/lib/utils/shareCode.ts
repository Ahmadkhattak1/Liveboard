const SHARE_CODE_STORAGE_PREFIX = 'liveboard-share-code:';

export function normalizeShareCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

export function formatShareCode(value: string): string {
  const normalized = normalizeShareCode(value);
  if (normalized.length <= 4) {
    return normalized;
  }

  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function getBoardShareCodeStorageKey(boardId: string): string {
  return `${SHARE_CODE_STORAGE_PREFIX}${boardId}`;
}
