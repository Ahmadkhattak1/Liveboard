'use client';

import React, { useState } from 'react';
import { useCanvas } from '@/components/canvas/CanvasProvider';
import { TOOLS } from '@/lib/constants/tools';
import { DRAWING_COLORS } from '@/lib/constants/colors';
import styles from './Toolbar.module.css';

export function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    zoom,
    setZoom,
    canvas,
  } = useCanvas();

  const [showProperties, setShowProperties] = useState(true);

  const tools = [
    { ...TOOLS.SELECT, group: 'basic' },
    { id: 'hand', name: 'Hand Tool', emoji: '✋', shortcut: 'H', group: 'basic' },
    { ...TOOLS.PEN, group: 'basic' },
    { id: 'sticky', name: 'Sticky Note', emoji: '📝', shortcut: 'N', group: 'basic' },
    null, // divider
    { ...TOOLS.RECTANGLE, group: 'shapes' },
    { ...TOOLS.CIRCLE, group: 'shapes' },
    { ...TOOLS.LINE, group: 'shapes' },
    null, // divider
    { ...TOOLS.TEXT, group: 'text' },
    { id: 'image', name: 'Image', emoji: '🖼️', shortcut: 'I', group: 'media' },
  ];

  const handleZoomIn = () => {
    if (canvas) {
      const newZoom = Math.min(zoom * 1.2, 5);
      setZoom(newZoom);
      canvas.setZoom(newZoom);
      canvas.renderAll();
    }
  };

  const handleZoomOut = () => {
    if (canvas) {
      const newZoom = Math.max(zoom / 1.2, 0.1);
      setZoom(newZoom);
      canvas.setZoom(newZoom);
      canvas.renderAll();
    }
  };

  const handleResetZoom = () => {
    if (canvas) {
      setZoom(1);
      canvas.setZoom(1);
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      canvas.renderAll();
    }
  };

  return (
    <>
      {/* Left Sidebar Toolbar */}
      <div className={styles.toolbar}>
        {tools.map((tool, index) => {
          if (tool === null) {
            return <div key={`divider-${index}`} className={styles.divider} />;
          }

          return (
            <button
              key={tool.id}
              onClick={() => {
                setActiveTool(tool.id as any);
                if (tool.id !== 'select') {
                  setShowProperties(true);
                }
              }}
              className={`${styles.toolButton} ${
                activeTool === tool.id ? styles.active : ''
              }`}
              data-tooltip={`${tool.name} (${tool.shortcut})`}
            >
              <span className={styles.emoji}>{tool.emoji}</span>
            </button>
          );
        })}
      </div>

      {/* Properties Panel (Bottom Left) */}
      {showProperties && activeTool !== 'select' && activeTool !== 'hand' && (
        <div className={styles.propertiesPanel}>
          {/* Color Picker */}
          <div className={styles.propertySection}>
            <div className={styles.propertyLabel}>Color</div>
            <div className={styles.colorGrid}>
              {DRAWING_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setStrokeColor(color)}
                  className={`${styles.colorButton} ${
                    strokeColor === color ? styles.active : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* Stroke Width */}
          {activeTool === 'pen' || activeTool === 'line' && (
            <div className={styles.propertySection}>
              <div className={styles.propertyLabel}>Stroke Width</div>
              <div className={styles.sliderContainer}>
                <div className={styles.sliderValue}>
                  <span>{strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zoom Controls (Bottom Right) */}
      <div className={styles.zoomControls}>
        <button
          onClick={handleZoomOut}
          className={styles.zoomButton}
          title="Zoom Out (Ctrl + -)"
        >
          −
        </button>
        <div className={styles.zoomDisplay}>{Math.round(zoom * 100)}%</div>
        <button
          onClick={handleZoomIn}
          className={styles.zoomButton}
          title="Zoom In (Ctrl + +)"
        >
          +
        </button>
        <button
          onClick={handleResetZoom}
          className={styles.zoomButton}
          title="Reset Zoom (Ctrl + 0)"
        >
          ⟲
        </button>
      </div>
    </>
  );
}
