import { Tool } from '@/types/canvas';

export const TOOLS: Record<string, Tool> = {
  SELECT: {
    id: 'select',
    name: 'Select',
    emoji: '👆',
    shortcut: 'V',
  },
  PEN: {
    id: 'pen',
    name: 'Pen',
    emoji: '✏️',
    shortcut: 'P',
    color: '#3b82f6',
  },
  TEXT: {
    id: 'text',
    name: 'Text',
    emoji: '📝',
    shortcut: 'T',
    color: '#10b981',
  },
  RECTANGLE: {
    id: 'rectangle',
    name: 'Rectangle',
    emoji: '▭',
    shortcut: 'R',
    color: '#f59e0b',
  },
  CIRCLE: {
    id: 'circle',
    name: 'Circle',
    emoji: '⭕',
    shortcut: 'C',
    color: '#f59e0b',
  },
  LINE: {
    id: 'line',
    name: 'Line',
    emoji: '─',
    shortcut: 'L',
    color: '#f59e0b',
  },
  IMAGE: {
    id: 'image',
    name: 'Image',
    emoji: '🖼️',
    shortcut: 'I',
    color: '#8b5cf6',
  },
  ERASER: {
    id: 'eraser',
    name: 'Eraser',
    emoji: '🗑️',
    shortcut: 'E',
    color: '#ef4444',
  },
};

export const USER_EMOJIS = [
  '😀', '😎', '🤓', '🥳', '🤠',
  '🦊', '🐼', '🐨', '🐸', '🦄',
  '🌈', '⭐', '🚀', '🎨', '🎭',
  '🎪', '🎯', '🎸', '🎮', '🏀',
  '⚽', '🎲', '🎪', '🎨', '🌮',
];

export const BOARD_EMOJIS = [
  '😀', '😎', '🤓', '🥳', '🤠', '🫡', '🧠', '🧩',
  '🚀', '⚡', '🔥', '💡', '✨', '⭐', '🌈', '☁️',
  '🌍', '🌊', '🌱', '🌴', '🍀', '🌸', '🌻', '🍎',
  '🍕', '🍔', '🍣', '🍩', '☕', '🧋', '🍿', '🍪',
  '🎨', '🖌️', '🖍️', '📐', '📏', '🧪', '🔬', '🔭',
  '💻', '🖥️', '⌨️', '📱', '🛰️', '🤖', '🛠️', '🧰',
  '📚', '📓', '📘', '📙', '📝', '📌', '📎', '🗂️',
  '🏠', '🏢', '🏫', '🏟️', '🗺️', '🧭', '✈️', '🚆',
  '🚴', '🎯', '🎮', '🎲', '🎵', '🎸', '🎺', '🎬',
  '🏀', '⚽', '🏈', '🎾', '🏓', '🥊', '🎳', '🏆',
  '🦊', '🐼', '🐨', '🐸', '🐙', '🐳', '🦄', '🐝',
  '💼', '🧾', '📊', '📈', '🧮', '🔒', '🔑', '🪙',
];

export const PRIORITY_BOARD_EMOJIS = [
  '🔥', '⚡', '✨', '⭐',
  '🌿', '🌱', '🌸', '🌊',
  '🍃', '🌴', '🌵', '🌻',
  '🍂', '🪴', '🪵', '🪨',
  '🧭', '🗺️', '🛰️', '🛠️',
  '🧰', '🧪', '🔭', '🧩',
  '📌', '📎', '🗂️', '🪙',
];

export function getRandomEmoji(): string {
  return USER_EMOJIS[Math.floor(Math.random() * USER_EMOJIS.length)];
}

export function getRandomBoardEmoji(): string {
  const source =
    Math.random() < 0.75 && PRIORITY_BOARD_EMOJIS.length > 0
      ? PRIORITY_BOARD_EMOJIS
      : BOARD_EMOJIS;

  return source[Math.floor(Math.random() * source.length)] || '🧩';
}

export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_FONT_SIZE = 20;
export const DEFAULT_OPACITY = 1;
