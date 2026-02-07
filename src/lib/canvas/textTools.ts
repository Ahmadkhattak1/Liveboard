import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';

export function addText(
  canvas: fabric.Canvas,
  userId: string,
  text: string = 'Double click to edit',
  options: {
    left?: number;
    top?: number;
    fontSize?: number;
    fill?: string;
    fontFamily?: string;
  } = {}
): fabric.IText {
  const textObj = new fabric.IText(text, {
    left: options.left || 100,
    top: options.top || 100,
    fontSize: options.fontSize || 20,
    fill: options.fill || '#000000',
    fontFamily: options.fontFamily || 'Arial',
  });

  addObjectId(textObj, userId);
  canvas.add(textObj);
  canvas.setActiveObject(textObj);
  canvas.renderAll();

  return textObj;
}

export function enterEditMode(textObj: fabric.IText): void {
  textObj.enterEditing();
  textObj.selectAll();
}
