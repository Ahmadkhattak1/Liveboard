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

export function validateBoardId(boardId: string): boolean {
  return /^[a-zA-Z0-9_-]{12}$/.test(boardId);
}

export function sanitizeDisplayName(name: string): string {
  return name.trim().slice(0, 50);
}
