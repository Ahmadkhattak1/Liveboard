export const USER_COLORS = [
  '#ef4444', // red
  '#f59e0b', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
];

// Reduced to widely used annotation colors
export const DRAWING_COLORS = [
  '#000000', // black
  '#ef4444', // red
  '#f59e0b', // amber
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

export const DEFAULT_STROKE_COLOR = '#000000';
export const DEFAULT_FILL_COLOR = 'transparent';
export const DEFAULT_BACKGROUND_COLOR = '#ffffff';
export const DEFAULT_BACKGROUND_COLOR_DARK = '#1a1a1a';

export function getRandomColor(colors: string[] = USER_COLORS): string {
  return colors[Math.floor(Math.random() * colors.length)];
}

export function hexToRgba(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
