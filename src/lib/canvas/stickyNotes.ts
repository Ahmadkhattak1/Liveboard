import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';

const STICKY_NOTE_COLORS = [
  '#F6E46C',
  '#F3EA9A',
  '#F3B06D',
  '#F08F93',
  '#DEB8D8',
  '#DD89D3',
  '#9CB8E4',
  '#9B90E0',
  '#79C1DF',
  '#749DDC',
  '#73CCC3',
  '#5FD17D',
  '#BFDC8D',
  '#A7D94F',
  '#D6D6D9',
  '#1F1F22',
];
const DEFAULT_STICKY_NOTE_COLOR = STICKY_NOTE_COLORS[0];

const STICKY_PADDING = 14;
const STICKY_PLACEHOLDER_TEXT = 'Type here...';
const STICKY_WORD_LIMIT = 60;
const STICKY_MIN_WIDTH = 170;
const STICKY_MIN_HEIGHT = 130;
const STICKY_MAX_WIDTH = 700;
const STICKY_MAX_HEIGHT = 700;
const STICKY_DEFAULT_WIDTH = 240;
const STICKY_DEFAULT_HEIGHT = 220;

type StickyRole = 'container' | 'text';

interface StickyLinkedObject {
  stickyNoteId?: string;
  stickyRole?: StickyRole;
  stickyHasPlaceholder?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(input: string): string | null {
  const value = input.trim();
  if (!value.startsWith('#')) return null;
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  if (value.length === 7) {
    return value.toUpperCase();
  }
  return null;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(color);
  if (!normalized) return null;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

function adjustHexColor(color: string, amount: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return rgbToHex(
    clamp(rgb.r + amount, 0, 255),
    clamp(rgb.g + amount, 0, 255),
    clamp(rgb.b + amount, 0, 255)
  );
}

function getStickyTextColor(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return '#1F1F1F';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.55 ? '#1F1F1F' : '#F8F8F8';
}

function toAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) return `rgba(31, 31, 31, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function createStickyId(): string {
  return `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function setStickyMetadata(object: fabric.Object, stickyId: string, role: StickyRole): void {
  const stickyObject = object as fabric.Object & StickyLinkedObject;
  stickyObject.stickyNoteId = stickyId;
  stickyObject.stickyRole = role;
}

function getStickyId(object: fabric.Object | null | undefined): string | null {
  if (!object) return null;
  return ((object as fabric.Object & StickyLinkedObject).stickyNoteId ?? null) as string | null;
}

function getStickyRole(object: fabric.Object | null | undefined): StickyRole | null {
  if (!object) return null;
  return ((object as fabric.Object & StickyLinkedObject).stickyRole ?? null) as StickyRole | null;
}

function isTextbox(object: fabric.Object): object is fabric.Textbox {
  return object instanceof fabric.Textbox;
}

function applyPlaceholderStyle(textbox: fabric.Textbox, textColor?: string): void {
  const stickyTextbox = textbox as fabric.Textbox & StickyLinkedObject;
  const sourceFill = textColor ?? (typeof textbox.fill === 'string' ? textbox.fill : '#1F1F1F');
  stickyTextbox.stickyHasPlaceholder = true;
  textbox.set({
    text: STICKY_PLACEHOLDER_TEXT,
    fill: toAlpha(sourceFill, 0.45),
    fontStyle: 'italic',
  });
}

function applyRegularTextStyle(textbox: fabric.Textbox, textColor?: string): void {
  const stickyTextbox = textbox as fabric.Textbox & StickyLinkedObject;
  const sourceFill = textColor ?? (typeof textbox.fill === 'string' ? textbox.fill : '#1F1F1F');
  stickyTextbox.stickyHasPlaceholder = false;
  textbox.set({
    fill: sourceFill,
    fontStyle: 'normal',
  });
}

function isStickyPlaceholder(textbox: fabric.Textbox): boolean {
  return Boolean((textbox as fabric.Textbox & StickyLinkedObject).stickyHasPlaceholder);
}

function getScaledRectSize(rect: fabric.Rect): { width: number; height: number } {
  return {
    width: (rect.width ?? STICKY_DEFAULT_WIDTH) * (rect.scaleX ?? 1),
    height: (rect.height ?? STICKY_DEFAULT_HEIGHT) * (rect.scaleY ?? 1),
  };
}

function truncateToWordLimit(text: string, limit: number): string {
  if (limit <= 0) return '';
  const tokens = text.match(/\s+|\S+/g) ?? [];
  let words = 0;
  let output = '';

  for (const token of tokens) {
    const isWord = /\S/.test(token);
    if (isWord) {
      if (words >= limit) {
        break;
      }
      words += 1;
    }
    output += token;
  }

  return output.replace(/\s+$/g, '');
}

export function addStickyNote(
  canvas: fabric.Canvas,
  userId: string,
  options: {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    text?: string;
    color?: string;
    autoEdit?: boolean;
  } = {}
): fabric.Rect {
  const width = clamp(options.width ?? STICKY_DEFAULT_WIDTH, STICKY_MIN_WIDTH, STICKY_MAX_WIDTH);
  const height = clamp(options.height ?? STICKY_DEFAULT_HEIGHT, STICKY_MIN_HEIGHT, STICKY_MAX_HEIGHT);
  const left = options.left ?? 100;
  const top = options.top ?? 100;
  const color = options.color ?? DEFAULT_STICKY_NOTE_COLOR;
  const stickyId = createStickyId();
  const trimmedText = (options.text ?? '').trim();
  const hasInitialText = trimmedText.length > 0;
  const textContent = hasInitialText ? options.text! : STICKY_PLACEHOLDER_TEXT;
  const textColor = getStickyTextColor(color);

  const rect = new fabric.Rect({
    left,
    top,
    width,
    height,
    fill: color,
    stroke: adjustHexColor(color, -24),
    strokeWidth: 1,
    rx: 10,
    ry: 10,
    lockScalingFlip: true,
    lockRotation: true,
    shadow: new fabric.Shadow({
      color: 'rgba(0, 0, 0, 0.18)',
      blur: 14,
      offsetX: 0,
      offsetY: 5,
    }),
  });

  const textbox = new fabric.Textbox(textContent, {
    left: left + STICKY_PADDING,
    top: top + STICKY_PADDING,
    width: width - STICKY_PADDING * 2,
    height: height - STICKY_PADDING * 2,
    fontSize: 18,
    fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
    fill: textColor,
    editable: true,
    textAlign: 'left',
    lineHeight: 1.25,
    hasControls: false,
    lockScalingX: true,
    lockScalingY: true,
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true,
    cursorWidth: 1.4,
  });

  setStickyMetadata(rect, stickyId, 'container');
  setStickyMetadata(textbox, stickyId, 'text');

  if (!hasInitialText) {
    applyPlaceholderStyle(textbox, textColor);
  }

  let removingLinkedObject = false;
  let allowTextSelection = false;
  let applyingTextGuard = false;

  const ensureStickyStackOrder = () => {
    canvas.bringObjectToFront(rect);
    canvas.bringObjectToFront(textbox);
  };

  const syncTextboxLayout = (
    dimensions: {
      width: number;
      height: number;
    } = getScaledRectSize(rect)
  ) => {
    const rectLeft = rect.left ?? left;
    const rectTop = rect.top ?? top;
    textbox.set({
      left: rectLeft + STICKY_PADDING,
      top: rectTop + STICKY_PADDING,
      width: Math.max(70, dimensions.width - STICKY_PADDING * 2),
      height: Math.max(40, dimensions.height - STICKY_PADDING * 2),
    });
    textbox.setCoords();
  };

  const normalizeRectDimensions = () => {
    const size = getScaledRectSize(rect);
    const normalizedWidth = clamp(size.width, STICKY_MIN_WIDTH, STICKY_MAX_WIDTH);
    const normalizedHeight = clamp(size.height, STICKY_MIN_HEIGHT, STICKY_MAX_HEIGHT);
    rect.set({
      width: normalizedWidth,
      height: normalizedHeight,
      scaleX: 1,
      scaleY: 1,
    });
    syncTextboxLayout({
      width: normalizedWidth,
      height: normalizedHeight,
    });
    rect.setCoords();
  };

  const ensureWordLimit = () => {
    const rawText = textbox.text ?? '';
    const limitedText = truncateToWordLimit(rawText, STICKY_WORD_LIMIT);
    if (limitedText === rawText) {
      return;
    }

    applyingTextGuard = true;
    textbox.set({ text: limitedText });
    const cursor = limitedText.length;
    textbox.selectionStart = cursor;
    textbox.selectionEnd = cursor;
    applyingTextGuard = false;
  };

  const autoGrowHeightToFitText = () => {
    if (isStickyPlaceholder(textbox)) {
      return;
    }

    const size = getScaledRectSize(rect);
    const requiredTextHeight = Math.ceil(textbox.calcTextHeight() + 8);
    const requiredRectHeight = clamp(
      requiredTextHeight + STICKY_PADDING * 2,
      STICKY_MIN_HEIGHT,
      STICKY_MAX_HEIGHT
    );

    if (requiredRectHeight <= size.height + 0.5) {
      return;
    }

    rect.set({
      height: requiredRectHeight,
      scaleY: 1,
    });

    syncTextboxLayout({
      width: size.width,
      height: requiredRectHeight,
    });

    rect.setCoords();
  };

  const focusTextbox = (selectAll = false) => {
    if (!canvas.getObjects().includes(textbox)) {
      return;
    }
    allowTextSelection = true;
    canvas.setActiveObject(textbox);
    textbox.enterEditing();
    if (selectAll) {
      textbox.selectAll();
    }
    allowTextSelection = false;
    canvas.requestRenderAll();
  };

  rect.on('selected', ensureStickyStackOrder);
  rect.on('mousedown', ensureStickyStackOrder);

  rect.on('moving', () => {
    syncTextboxLayout();
    canvas.requestRenderAll();
  });

  rect.on('scaling', () => {
    syncTextboxLayout(getScaledRectSize(rect));
    canvas.requestRenderAll();
  });

  rect.on('modified', () => {
    normalizeRectDimensions();
    ensureStickyStackOrder();
    canvas.requestRenderAll();
  });

  rect.on('mousedblclick', () => {
    focusTextbox(true);
  });

  textbox.on('selected', () => {
    if (allowTextSelection || textbox.isEditing) {
      return;
    }
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
  });

  textbox.on('mousedblclick', () => {
    focusTextbox(false);
  });

  textbox.on('editing:entered', () => {
    const activeColor = getStickyTextColor(typeof rect.fill === 'string' ? rect.fill : color);
    if (isStickyPlaceholder(textbox)) {
      applyRegularTextStyle(textbox, activeColor);
      textbox.set({ text: '' });
      canvas.requestRenderAll();
    }
  });

  textbox.on('changed', () => {
    if (applyingTextGuard) {
      return;
    }
    if (isStickyPlaceholder(textbox)) {
      return;
    }
    ensureWordLimit();
    autoGrowHeightToFitText();
    canvas.requestRenderAll();
  });

  textbox.on('editing:exited', () => {
    const activeColor = getStickyTextColor(typeof rect.fill === 'string' ? rect.fill : color);
    const current = (textbox.text ?? '').trim();
    if (!current) {
      applyPlaceholderStyle(textbox, activeColor);
    } else {
      ensureWordLimit();
      applyRegularTextStyle(textbox, activeColor);
      autoGrowHeightToFitText();
    }
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
  });

  rect.on('removed', () => {
    if (removingLinkedObject || !canvas.getObjects().includes(textbox)) {
      return;
    }
    removingLinkedObject = true;
    canvas.remove(textbox);
    removingLinkedObject = false;
  });

  textbox.on('removed', () => {
    if (removingLinkedObject || !canvas.getObjects().includes(rect)) {
      return;
    }
    removingLinkedObject = true;
    canvas.remove(rect);
    removingLinkedObject = false;
  });

  addObjectId(rect, userId);
  addObjectId(textbox, userId);

  canvas.add(rect);
  canvas.add(textbox);
  normalizeRectDimensions();
  ensureWordLimit();
  autoGrowHeightToFitText();
  ensureStickyStackOrder();
  canvas.setActiveObject(rect);
  canvas.renderAll();

  if (options.autoEdit !== false) {
    window.setTimeout(() => {
      if (!canvas.getObjects().includes(textbox)) {
        return;
      }
      focusTextbox(true);
    }, 0);
  }

  return rect;
}

export function isStickyObject(object: fabric.Object | null | undefined): boolean {
  return Boolean(getStickyId(object) && getStickyRole(object));
}

export function isStickyContainer(object: fabric.Object | null | undefined): object is fabric.Rect {
  return Boolean(object && getStickyRole(object) === 'container' && object instanceof fabric.Rect);
}

export function getStickyObjectId(object: fabric.Object | null | undefined): string | null {
  return getStickyId(object);
}

export function findStickyContainerById(
  canvas: fabric.Canvas,
  stickyId: string
): fabric.Rect | null {
  const found = canvas
    .getObjects()
    .find((object) => getStickyId(object) === stickyId && getStickyRole(object) === 'container');
  return found instanceof fabric.Rect ? found : null;
}

export function getStickyContainerForObject(
  canvas: fabric.Canvas,
  object: fabric.Object | null | undefined
): fabric.Rect | null {
  if (!object) return null;
  if (isStickyContainer(object)) return object;
  const stickyId = getStickyId(object);
  if (!stickyId) return null;
  return findStickyContainerById(canvas, stickyId);
}

export function getStickyTextForContainer(
  canvas: fabric.Canvas,
  container: fabric.Rect | null | undefined
): fabric.Textbox | null {
  if (!container) return null;
  const stickyId = getStickyId(container);
  if (!stickyId) return null;
  const found = canvas
    .getObjects()
    .find((object) => getStickyId(object) === stickyId && getStickyRole(object) === 'text');
  return found && isTextbox(found) ? found : null;
}

export function focusStickyNoteEditor(
  canvas: fabric.Canvas,
  stickySource: fabric.Object,
  selectAll = false
): boolean {
  const container = getStickyContainerForObject(canvas, stickySource);
  if (!container) return false;
  const textbox = getStickyTextForContainer(canvas, container);
  if (!textbox) return false;
  canvas.bringObjectToFront(container);
  canvas.bringObjectToFront(textbox);
  canvas.setActiveObject(textbox);
  textbox.enterEditing();
  if (selectAll) {
    textbox.selectAll();
  }
  canvas.requestRenderAll();
  return true;
}

export function typeInStickyNote(
  canvas: fabric.Canvas,
  stickySource: fabric.Object,
  input: string
): boolean {
  if (!input) return false;

  const container = getStickyContainerForObject(canvas, stickySource);
  if (!container) return false;
  const textbox = getStickyTextForContainer(canvas, container);
  if (!textbox) return false;

  const noteColor = typeof container.fill === 'string' ? container.fill : DEFAULT_STICKY_NOTE_COLOR;
  const textColor = getStickyTextColor(noteColor);

  if (!textbox.isEditing) {
    canvas.bringObjectToFront(container);
    canvas.bringObjectToFront(textbox);
    canvas.setActiveObject(textbox);
    textbox.enterEditing();
  }

  if (isStickyPlaceholder(textbox)) {
    applyRegularTextStyle(textbox, textColor);
    textbox.set({ text: '' });
  }

  const source = textbox.text ?? '';
  const start = textbox.selectionStart ?? source.length;
  const end = textbox.selectionEnd ?? start;
  const next = `${source.slice(0, start)}${input}${source.slice(end)}`;
  const limited = truncateToWordLimit(next, STICKY_WORD_LIMIT);
  const cursor = limited.length;

  textbox.set({ text: limited });
  textbox.selectionStart = cursor;
  textbox.selectionEnd = cursor;
  textbox.fire('changed');
  canvas.requestRenderAll();

  return true;
}

export function setStickyNoteColor(
  canvas: fabric.Canvas,
  stickySource: fabric.Object,
  color: string
): boolean {
  const container = getStickyContainerForObject(canvas, stickySource);
  if (!container) return false;
  const textbox = getStickyTextForContainer(canvas, container);

  container.set({
    fill: color,
    stroke: adjustHexColor(color, -24),
  });

  if (textbox) {
    const textColor = getStickyTextColor(color);
    if (isStickyPlaceholder(textbox)) {
      textbox.set({
        fill: toAlpha(textColor, 0.45),
      });
    } else {
      textbox.set({
        fill: textColor,
      });
    }
  }

  canvas.requestRenderAll();
  return true;
}

export function duplicateStickyNote(
  canvas: fabric.Canvas,
  userId: string,
  stickySource: fabric.Object
): fabric.Rect | null {
  const container = getStickyContainerForObject(canvas, stickySource);
  if (!container) return null;
  const textbox = getStickyTextForContainer(canvas, container);
  const size = getScaledRectSize(container);
  const sourceFill =
    typeof container.fill === 'string'
      ? container.fill
      : DEFAULT_STICKY_NOTE_COLOR;
  const sourceText = textbox && !isStickyPlaceholder(textbox) ? textbox.text ?? '' : '';

  return addStickyNote(canvas, userId, {
    left: (container.left ?? 100) + 32,
    top: (container.top ?? 100) + 28,
    width: size.width,
    height: size.height,
    color: sourceFill,
    text: sourceText,
    autoEdit: false,
  });
}

export function removeStickyNote(canvas: fabric.Canvas, stickySource: fabric.Object): boolean {
  const container = getStickyContainerForObject(canvas, stickySource);
  if (!container) {
    if (canvas.getObjects().includes(stickySource)) {
      canvas.remove(stickySource);
      return true;
    }
    return false;
  }
  if (!canvas.getObjects().includes(container)) {
    return false;
  }
  canvas.remove(container);
  canvas.requestRenderAll();
  return true;
}

export function getStickyNoteColor(
  canvas: fabric.Canvas,
  stickySource: fabric.Object
): string | null {
  const container = getStickyContainerForObject(canvas, stickySource);
  if (!container) return null;
  return typeof container.fill === 'string' ? container.fill : null;
}

export function getStickyNoteText(
  canvas: fabric.Canvas,
  stickySource: fabric.Object
): string | null {
  const container = getStickyContainerForObject(canvas, stickySource);
  if (!container) return null;
  const textbox = getStickyTextForContainer(canvas, container);
  if (!textbox || isStickyPlaceholder(textbox)) {
    return '';
  }
  return textbox.text ?? '';
}

export {
  STICKY_DEFAULT_HEIGHT,
  STICKY_DEFAULT_WIDTH,
  STICKY_MAX_HEIGHT,
  STICKY_MAX_WIDTH,
  STICKY_MIN_HEIGHT,
  STICKY_MIN_WIDTH,
  STICKY_WORD_LIMIT,
};

export { DEFAULT_STICKY_NOTE_COLOR, STICKY_NOTE_COLORS, STICKY_PLACEHOLDER_TEXT };
