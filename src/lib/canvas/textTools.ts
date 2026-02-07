import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';

export function addText(
  canvas: fabric.Canvas,
  userId: string,
  text: string = 'Text',
  options: {
    left?: number;
    top?: number;
    fontSize?: number;
    fill?: string;
    fontFamily?: string;
    autoEdit?: boolean;
    selectAll?: boolean;
  } = {}
): fabric.IText {
  const textObj = new fabric.IText(text, {
    left: options.left ?? 100,
    top: options.top ?? 100,
    fontSize: options.fontSize ?? 24,
    fill: options.fill ?? '#000000',
    fontFamily: options.fontFamily ?? '"Trebuchet MS", "Segoe UI", sans-serif',
  });

  addObjectId(textObj, userId);
  canvas.add(textObj);
  canvas.setActiveObject(textObj);

  if (options.autoEdit !== false) {
    textObj.enterEditing();
    if (options.selectAll !== false) {
      textObj.selectAll();
    }
  }
  canvas.requestRenderAll();

  return textObj;
}

export function enterEditMode(textObj: fabric.IText): void {
  textObj.enterEditing();
  textObj.selectAll();
}
