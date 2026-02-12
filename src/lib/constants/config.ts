export const APP_CONFIG = {
  name: 'Liveboard',
  description: 'Collaborative canvas for teams',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  maxImageSizeMB: parseInt(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE_MB || '5'),
  maxImageDimensionPx: parseInt(process.env.NEXT_PUBLIC_MAX_IMAGE_DIMENSION_PX || '8192'),
  maxImagePixels: parseInt(process.env.NEXT_PUBLIC_MAX_IMAGE_PIXELS || '40000000'),
  maxClipboardImagesPerPaste: parseInt(process.env.NEXT_PUBLIC_MAX_CLIPBOARD_IMAGES_PER_PASTE || '3'),
  maxObjectsPerBoard: parseInt(process.env.NEXT_PUBLIC_MAX_OBJECTS_PER_BOARD || '1000'),
  enableAnonymousEditing: process.env.NEXT_PUBLIC_ENABLE_ANONYMOUS_EDITING === 'true',
  enableGoogleAuth: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === 'true',
};

export const CANVAS_CONFIG = {
  defaultWidth: 1920,
  defaultHeight: 1080,
  minWidth: parseInt(process.env.NEXT_PUBLIC_CANVAS_MIN_WIDTH || '900'),
  minHeight: parseInt(process.env.NEXT_PUBLIC_CANVAS_MIN_HEIGHT || '560'),
  // <= 0 means "no max constraint" and allows the canvas to fill large viewports.
  maxWidth: parseInt(process.env.NEXT_PUBLIC_CANVAS_MAX_WIDTH || '0'),
  maxHeight: parseInt(process.env.NEXT_PUBLIC_CANVAS_MAX_HEIGHT || '0'),
  minZoom: 0.1,
  maxZoom: 5,
  zoomStep: 0.1,
};

export const SYNC_CONFIG = {
  debounceMs: 300,
  cursorThrottleMs: 100,
  presenceUpdateMs: 5000,
  inactiveTimeoutMs: 30000,
};

export const STORAGE_KEYS = {
  theme: 'liveboard-theme',
  lastBoardId: 'liveboard-last-board',
  userPreferences: 'liveboard-user-prefs',
};
