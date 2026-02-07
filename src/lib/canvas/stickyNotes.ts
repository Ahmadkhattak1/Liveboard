import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';

const STICKY_NOTE_COLORS = [
  '#FFE87C', // Yellow
  '#FFB3BA', // Pink
  '#BAE1FF', // Blue
  '#BAFFC9', // Green
  '#FFD9BA', // Orange
  '#E0BBE4', // Purple
];

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
  } = {}
): fabric.Group {
  const width = options.width || 200;
  const height = options.height || 200;
  const left = options.left || 100;
  const top = options.top || 100;
  const color = options.color || STICKY_NOTE_COLORS[Math.floor(Math.random() * STICKY_NOTE_COLORS.length)];

  // Create the sticky note background
  const rect = new fabric.Rect({
    width,
    height,
    fill: color,
    stroke: 'transparent',
    strokeWidth: 0,
    rx: 4,
    ry: 4,
    shadow: new fabric.Shadow({
      color: 'rgba(0, 0, 0, 0.2)',
      blur: 10,
      offsetX: 0,
      offsetY: 3,
    }),
  });

  // Create the text
  const text = new fabric.IText(options.text || 'Double click to edit...', {
    fontSize: 16,
    fontFamily: 'Arial, sans-serif',
    fill: '#333333',
    width: width - 32,
    left: 16,
    top: 16,
    editable: true,
    textAlign: 'left',
  });

  // Group the rectangle and text together
  const group = new fabric.Group([rect, text], {
    left,
    top,
    selectable: true,
    hasControls: true,
  });

  addObjectId(group, userId);
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.renderAll();

  // Allow editing text on double-click
  group.on('mousedblclick', () => {
    canvas.remove(group);
    text.set({
      left: group.left! + 16,
      top: group.top! + 16,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    canvas.renderAll();
  });

  return group;
}

export { STICKY_NOTE_COLORS };
