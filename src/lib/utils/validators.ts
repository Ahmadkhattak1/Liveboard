import { APP_CONFIG } from '../constants/config';

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateImageFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (file.size === 0) {
    return {
      valid: false,
      error: 'Image file is empty',
    };
  }

  const maxSizeBytes = APP_CONFIG.maxImageSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `Image size must be less than ${APP_CONFIG.maxImageSizeMB}MB`,
    };
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid image type. Supported: JPG, PNG, GIF, WebP',
    };
  }

  return { valid: true };
}

export interface ImageDimensionValidationOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
}

export async function validateImageDimensions(
  file: File,
  options: ImageDimensionValidationOptions = {}
): Promise<{
  valid: boolean;
  width?: number;
  height?: number;
  error?: string;
}> {
  if (typeof window === 'undefined') {
    return {
      valid: false,
      error: 'Image dimension validation requires a browser environment',
    };
  }

  const maxWidth = resolvePositiveLimit(options.maxWidth, APP_CONFIG.maxImageDimensionPx, 8192);
  const maxHeight = resolvePositiveLimit(options.maxHeight, APP_CONFIG.maxImageDimensionPx, 8192);
  const maxPixels = resolvePositiveLimit(options.maxPixels, APP_CONFIG.maxImagePixels, 40000000);

  try {
    const { width, height } = await readImageDimensions(file);

    if (width <= 0 || height <= 0) {
      return {
        valid: false,
        error: 'Image dimensions are invalid',
      };
    }

    if (width > maxWidth || height > maxHeight) {
      return {
        valid: false,
        error: `Image dimensions must be within ${maxWidth}x${maxHeight}px`,
      };
    }

    if (width * height > maxPixels) {
      return {
        valid: false,
        error: `Image resolution is too large (max ${maxPixels.toLocaleString()} pixels)`,
      };
    }

    return { valid: true, width, height };
  } catch {
    return {
      valid: false,
      error: 'Unable to read image dimensions',
    };
  }
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      URL.revokeObjectURL(objectUrl);
      resolve({ width, height });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    image.src = objectUrl;
  });
}

function resolvePositiveLimit(
  primaryLimit: number | undefined,
  fallbackLimit: number,
  defaultValue: number
): number {
  const candidate = primaryLimit ?? fallbackLimit;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : defaultValue;
}

export function validateBoardId(boardId: string): boolean {
  return /^[a-zA-Z0-9_-]{12}$/.test(boardId);
}

export function sanitizeDisplayName(name: string): string {
  return name.trim().slice(0, 50);
}
