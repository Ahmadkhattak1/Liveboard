import * as fabric from 'fabric';
import { addObjectId } from './fabricCanvas';

export async function addImageFromURL(
  canvas: fabric.Canvas,
  userId: string,
  imageUrl: string,
  options: {
    left?: number;
    top?: number;
    scaleX?: number;
    scaleY?: number;
  } = {}
): Promise<fabric.Image> {
  const img = await fabric.Image.fromURL(imageUrl, { crossOrigin: 'anonymous' });

  img.set({
    left: options.left || 100,
    top: options.top || 100,
    scaleX: options.scaleX || 0.5,
    scaleY: options.scaleY || 0.5,
  });

  addObjectId(img, userId);
  canvas.add(img);
  canvas.setActiveObject(img);
  canvas.renderAll();

  return img;
}

export function addImageFromFile(
  canvas: fabric.Canvas,
  userId: string,
  file: File,
  options: {
    left?: number;
    top?: number;
    maxWidth?: number;
    maxHeight?: number;
  } = {}
): Promise<fabric.Image> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const imgElement = new Image();

      imgElement.onload = () => {
        const img = new fabric.Image(imgElement);

        // Scale image if too large
        const maxWidth = options.maxWidth || 500;
        const maxHeight = options.maxHeight || 500;

        let scale = 1;
        if (img.width! > maxWidth || img.height! > maxHeight) {
          scale = Math.min(maxWidth / img.width!, maxHeight / img.height!);
        }

        img.set({
          left: options.left || 100,
          top: options.top || 100,
          scaleX: scale,
          scaleY: scale,
        });

        addObjectId(img, userId);
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();

        resolve(img);
      };

      imgElement.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      imgElement.src = event.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}
