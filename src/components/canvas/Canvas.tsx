'use client';

import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useCanvas } from './CanvasProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { initializeFabricCanvas, resizeCanvas } from '@/lib/canvas/fabricCanvas';
import { enableDrawingMode, disableDrawingMode } from '@/lib/canvas/drawingTools';
import { addRectangle, addCircle, addLine } from '@/lib/canvas/shapeTools';
import { addText } from '@/lib/canvas/textTools';
import { addStickyNote } from '@/lib/canvas/stickyNotes';
import { PressureBrush } from '@/lib/canvas/pressureBrush';
import styles from './Canvas.module.css';

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const lastPosXRef = useRef(0);
  const lastPosYRef = useRef(0);
  const spacebarPressedRef = useRef(false);
  const middleMousePanningRef = useRef(false);
  const [hasSelection, setHasSelection] = React.useState(false);
  const {
    canvas,
    setCanvas,
    activeTool,
    setActiveTool,
    strokeColor,
    fillColor,
    strokeWidth,
    zoom,
    setZoom,
    undo,
    redo,
  } = useCanvas();
  const { user } = useAuth();

  // Delete selected objects
  const handleDelete = () => {
    if (!canvas) return;

    const activeObjects = canvas.getActiveObjects();
    if (activeObjects && activeObjects.length > 0) {
      activeObjects.forEach((obj) => {
        canvas.remove(obj);
      });
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  };

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const fabricCanvas = initializeFabricCanvas(canvasRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    setCanvas(fabricCanvas);

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current) {
        resizeCanvas(
          fabricCanvas,
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      fabricCanvas.dispose();
    };
  }, [setCanvas]);

  // Handle tool changes
  useEffect(() => {
    if (!canvas || !user) return;

    // Reset canvas interaction mode
    canvas.isDrawingMode = false;
    canvas.selection = true;

    // Remove any previous event listeners
    canvas.off('mouse:down');

    switch (activeTool) {
      case 'select':
        // Default select mode
        canvas.selection = true;
        break;

      case 'hand':
        // Hand tool for panning
        canvas.selection = false;
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';

        let isHandPanning = false;
        let lastX = 0;
        let lastY = 0;

        const handleHandMouseDown = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
          isHandPanning = true;
          lastX = (e.e as any).clientX;
          lastY = (e.e as any).clientY;
          canvas.defaultCursor = 'grabbing';
          canvas.hoverCursor = 'grabbing';
        };

        const handleHandMouseMove = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
          if (isHandPanning) {
            const vpt = canvas.viewportTransform;
            if (vpt) {
              vpt[4] += (e.e as any).clientX - lastX;
              vpt[5] += (e.e as any).clientY - lastY;
              canvas.requestRenderAll();
              lastX = (e.e as any).clientX;
              lastY = (e.e as any).clientY;
            }
          }
        };

        const handleHandMouseUp = () => {
          isHandPanning = false;
          canvas.defaultCursor = 'grab';
          canvas.hoverCursor = 'grab';
        };

        canvas.on('mouse:down', handleHandMouseDown);
        canvas.on('mouse:move', handleHandMouseMove);
        canvas.on('mouse:up', handleHandMouseUp);
        break;

      case 'pen':
        // Enable free drawing mode with pressure simulation
        canvas.isDrawingMode = true;
        canvas.selection = false;

        const brush = new PressureBrush(canvas);
        brush.color = strokeColor;
        brush.widthValue = strokeWidth; // Use custom setter
        brush.strokeLineCap = 'round';
        brush.strokeLineJoin = 'round';
        canvas.freeDrawingBrush = brush;

        // Add ID to newly created paths
        canvas.on('path:created', (e: any) => {
          const path = e.path;
          (path as any).id = `path-${Date.now()}`;
          (path as any).createdBy = user.id;
        });
        break;

      case 'rectangle':
        canvas.selection = false;
        canvas.on('mouse:down', () => {
          addRectangle(canvas, user.id, {
            stroke: strokeColor,
            fill: fillColor,
            strokeWidth,
          });
        });
        break;

      case 'circle':
        canvas.selection = false;
        canvas.on('mouse:down', () => {
          addCircle(canvas, user.id, {
            stroke: strokeColor,
            fill: fillColor,
            strokeWidth,
          });
        });
        break;

      case 'line':
        canvas.selection = false;
        canvas.on('mouse:down', () => {
          addLine(canvas, user.id, {
            stroke: strokeColor,
            strokeWidth,
          });
        });
        break;

      case 'text':
        canvas.selection = false;
        canvas.on('mouse:down', () => {
          addText(canvas, user.id, 'Double click to edit', {
            fill: strokeColor,
          });
        });
        break;

      case 'sticky':
        canvas.selection = false;
        canvas.on('mouse:down', () => {
          addStickyNote(canvas, user.id);
        });
        break;

      case 'eraser':
        canvas.selection = true;
        // Eraser will use the delete key functionality
        break;
    }

    return () => {
      canvas.off('mouse:down');
      canvas.off('mouse:move');
      canvas.off('mouse:up');
      canvas.off('path:created');
    };
  }, [activeTool, canvas, user, strokeColor, fillColor, strokeWidth]);

  // Update brush settings when color/width changes
  useEffect(() => {
    if (!canvas || activeTool !== 'pen' || !canvas.freeDrawingBrush) return;

    canvas.freeDrawingBrush.color = strokeColor;

    // Use custom setter for PressureBrush
    if (canvas.freeDrawingBrush instanceof PressureBrush) {
      (canvas.freeDrawingBrush as PressureBrush).widthValue = strokeWidth;
    } else {
      canvas.freeDrawingBrush.width = strokeWidth;
    }
  }, [canvas, activeTool, strokeColor, strokeWidth]);

  // Track selection state for contextual delete button
  useEffect(() => {
    if (!canvas) return;

    const updateSelection = () => {
      const activeObjects = canvas.getActiveObjects();
      setHasSelection(activeObjects && activeObjects.length > 0);
    };

    canvas.on('selection:created', updateSelection);
    canvas.on('selection:updated', updateSelection);
    canvas.on('selection:cleared', updateSelection);

    return () => {
      canvas.off('selection:created', updateSelection);
      canvas.off('selection:updated', updateSelection);
      canvas.off('selection:cleared', updateSelection);
    };
  }, [canvas]);

  // Handle delete key - delete selected objects
  useEffect(() => {
    if (!canvas) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault();

        const activeObjects = canvas.getActiveObjects();
        if (activeObjects && activeObjects.length > 0) {
          activeObjects.forEach((obj) => {
            canvas.remove(obj);
          });
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canvas]);

  // Handle middle mouse button panning
  useEffect(() => {
    if (!canvas || !containerRef.current) return;

    const handleMiddleMouseDown = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      // Check if middle mouse button (button 1)
      if ((e.e as any).button === 1) {
        e.e.preventDefault();
        middleMousePanningRef.current = true;
        lastPosXRef.current = (e.e as any).clientX;
        lastPosYRef.current = (e.e as any).clientY;
        canvas.selection = false;
        if (containerRef.current) {
          containerRef.current.classList.add(styles.panning);
        }
      }
    };

    const handleMiddleMouseMove = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (middleMousePanningRef.current) {
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += (e.e as any).clientX - lastPosXRef.current;
          vpt[5] += (e.e as any).clientY - lastPosYRef.current;
          canvas.requestRenderAll();
          lastPosXRef.current = (e.e as any).clientX;
          lastPosYRef.current = (e.e as any).clientY;
        }
      }
    };

    const handleMiddleMouseUp = (e: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if ((e.e as any).button === 1 && middleMousePanningRef.current) {
        middleMousePanningRef.current = false;
        canvas.selection = activeTool !== 'pen' && activeTool !== 'hand';
        if (containerRef.current) {
          containerRef.current.classList.remove(styles.panning);
        }
      }
    };

    // Prevent default middle mouse behavior (like auto-scroll)
    const preventMiddleMouseDefault = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    };

    canvas.on('mouse:down', handleMiddleMouseDown);
    canvas.on('mouse:move', handleMiddleMouseMove);
    canvas.on('mouse:up', handleMiddleMouseUp);

    const canvasElement = canvas.getElement();
    canvasElement.addEventListener('mousedown', preventMiddleMouseDefault);

    return () => {
      canvas.off('mouse:down', handleMiddleMouseDown);
      canvas.off('mouse:move', handleMiddleMouseMove);
      canvas.off('mouse:up', handleMiddleMouseUp);
      canvasElement.removeEventListener('mousedown', preventMiddleMouseDefault);
    };
  }, [canvas, activeTool]);

  // Handle pan with spacebar + mouse drag
  useEffect(() => {
    if (!canvas || !containerRef.current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        spacebarPressedRef.current = true;
        canvas.defaultCursor = 'grab';
        canvas.hoverCursor = 'grab';
        if (containerRef.current) {
          containerRef.current.classList.add(styles.panning);
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacebarPressedRef.current = false;
        isPanningRef.current = false;
        canvas.defaultCursor = 'default';
        canvas.hoverCursor = 'move';
        if (containerRef.current) {
          containerRef.current.classList.remove(styles.panning);
        }
      }
    };

    const handleMouseDown = (event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (spacebarPressedRef.current) {
        isPanningRef.current = true;
        canvas.selection = false;
        lastPosXRef.current = (event.e as any).clientX;
        lastPosYRef.current = (event.e as any).clientY;
      }
    };

    const handleMouseMove = (event: fabric.TPointerEventInfo<fabric.TPointerEvent>) => {
      if (isPanningRef.current && spacebarPressedRef.current) {
        const e = event.e;
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += (e as any).clientX - lastPosXRef.current;
          vpt[5] += (e as any).clientY - lastPosYRef.current;
          canvas.requestRenderAll();
          lastPosXRef.current = (e as any).clientX;
          lastPosYRef.current = (e as any).clientY;
        }
      }
    };

    const handleMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        canvas.selection = activeTool !== 'pen';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [canvas, activeTool]);

  // Handle zoom with Ctrl+mouse wheel
  useEffect(() => {
    if (!canvas) return;

    const handleWheel = (opt: fabric.TPointerEventInfo<WheelEvent>) => {
      const event = opt.e;

      // Only zoom when Ctrl/Cmd is pressed
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY;
      let newZoom = canvas.getZoom();
      newZoom *= 0.999 ** delta;

      // Limit zoom range
      if (newZoom > 5) newZoom = 5;
      if (newZoom < 0.1) newZoom = 0.1;

      // Zoom to mouse pointer position
      const point = new fabric.Point(event.offsetX, event.offsetY);
      canvas.zoomToPoint(point, newZoom);
      setZoom(newZoom);
    };

    canvas.on('mouse:wheel', handleWheel);

    return () => {
      canvas.off('mouse:wheel', handleWheel);
    };
  }, [canvas, setZoom]);

  // Handle keyboard shortcuts (undo/redo, zoom, and tool selection)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      // Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y (Windows/Linux) or Cmd+Shift+Z (Mac)
      if (
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z') ||
        ((event.ctrlKey || event.metaKey) && event.key === 'y')
      ) {
        event.preventDefault();
        redo();
        return;
      }

      // Zoom in: Ctrl+Plus or Ctrl+=
      if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        if (!canvas) return;
        const newZoom = Math.min(zoom * 1.2, 5);
        setZoom(newZoom);
        canvas.setZoom(newZoom);
        canvas.renderAll();
        return;
      }

      // Zoom out: Ctrl+Minus
      if ((event.ctrlKey || event.metaKey) && (event.key === '-' || event.key === '_')) {
        event.preventDefault();
        if (!canvas) return;
        const newZoom = Math.max(zoom / 1.2, 0.1);
        setZoom(newZoom);
        canvas.setZoom(newZoom);
        canvas.renderAll();
        return;
      }

      // Reset zoom: Ctrl+0
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        if (!canvas) return;
        setZoom(1);
        canvas.setZoom(1);
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.renderAll();
        return;
      }

      // Tool shortcuts (only when not holding Ctrl/Cmd)
      if (!event.ctrlKey && !event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'v':
            event.preventDefault();
            setActiveTool('select');
            break;
          case 'h':
            event.preventDefault();
            setActiveTool('hand');
            break;
          case 'p':
            event.preventDefault();
            setActiveTool('pen');
            break;
          case 't':
            event.preventDefault();
            setActiveTool('text');
            break;
          case 'r':
            event.preventDefault();
            setActiveTool('rectangle');
            break;
          case 'c':
            event.preventDefault();
            setActiveTool('circle');
            break;
          case 'l':
            event.preventDefault();
            setActiveTool('line');
            break;
          case 'n':
            event.preventDefault();
            setActiveTool('sticky');
            break;
          case 'i':
            event.preventDefault();
            setActiveTool('image');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo, setActiveTool, canvas, zoom, setZoom]);

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas ref={canvasRef} />

      {/* Contextual delete button */}
      {hasSelection && (
        <button
          className={styles.deleteButton}
          onClick={handleDelete}
          title="Delete (Del)"
        >
          🗑️ Delete
        </button>
      )}
    </div>
  );
}
