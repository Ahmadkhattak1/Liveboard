'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CursorPointer,
  DesignPencil,
  DragHandGesture,
  EditPencil,
  MediaImage,
  PagePlus,
  RedoAction,
  Text,
  UndoAction,
} from 'iconoir-react';
import { useCanvas } from '@/components/canvas/CanvasProvider';
import { DRAWING_COLORS } from '@/lib/constants/colors';
import { ShapeToolType, isShapeToolType } from '@/lib/canvas/shapeTools';
import { ToolType } from '@/types/canvas';
import styles from './Toolbar.module.css';

const OPEN_IMAGE_PICKER_EVENT = 'liveboard:open-image-picker';

type PenMode = 'ink' | 'brush';

interface ShapeToolOption {
  id: ShapeToolType;
  name: string;
  shortcut?: string;
  icon: React.ReactNode;
}

interface ToolbarButtonTool {
  id: ToolType;
  name: string;
  shortcut: string;
  icon: React.ReactNode;
}

interface PenModeOption {
  id: PenMode;
  name: string;
  icon: React.ReactNode;
}

const SHAPE_GRID_COLUMNS = 4;
const SHAPE_VISIBLE_ROWS = 2;
const SHAPES_VISIBLE_COUNT = SHAPE_GRID_COLUMNS * SHAPE_VISIBLE_ROWS;
const PEN_SIZE_OPTIONS = [2, 4, 6] as const;
const ICON_STROKE_WIDTH = 2.05;

type ToolbarIconProps = {
  className?: string;
  strokeWidth?: string | number;
  'aria-hidden'?: React.AriaAttributes['aria-hidden'];
};

function ToolIcon({
  icon: Icon,
  className,
  strokeWidth = ICON_STROKE_WIDTH,
}: {
  icon: React.ComponentType<ToolbarIconProps>;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <Icon
      className={`${styles.vectorIcon} ${styles.houseIcon} ${className ?? ''}`}
      strokeWidth={strokeWidth}
      aria-hidden
    />
  );
}

function RectangleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <rect x="4" y="7" width="16" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <line x1="4" y1="16" x2="20" y2="8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ArrowConnectorIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <line x1="4" y1="18" x2="17" y2="7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <polyline
        points="13.4,7 17.4,7 17.4,11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ElbowArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <path
        d="M4 17H12V9H18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="15.6,6.8 19.6,8.8 15.6,10.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CurvedArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <path
        d="M4 16C8 6 14 6 19 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <polyline
        points="15.6,8.4 19.4,10.2 16.7,13.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RoundedRectangleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <rect x="4" y="7" width="16" height="10" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function DiamondIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <polygon
        points="12,4.5 19,12 12,19.5 5,12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <polygon
        points="12,5 19,18 5,18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <polygon
        points="12,3.8 14.6,9.1 20.4,9.9 16.2,13.9 17.2,19.6 12,16.8 6.8,19.6 7.8,13.9 3.6,9.9 9.4,9.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HexagonIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <polygon
        points="8,4.5 16,4.5 20,12 16,19.5 8,19.5 4,12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ParallelogramIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <polygon
        points="8,6 20,6 16,18 4,18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BlockArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.vectorIcon} aria-hidden="true">
      <polygon
        points="4,8 13,8 13,5 20,12 13,19 13,16 4,16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CursorIcon() {
  return <ToolIcon icon={CursorPointer} />;
}

function HandGrabIcon() {
  return <ToolIcon icon={DragHandGesture} />;
}

function GeometricShapesIcon() {
  return (
    <svg viewBox="0 0 24 24" className={`${styles.vectorIcon} ${styles.houseIcon}`} aria-hidden="true">
      <rect x="3.8" y="4.2" width="6.4" height="6.4" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="16.9" cy="7.4" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M4.4 18.8H10.1L7.2 13.9L4.4 18.8Z" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M13.2 19.1L20 12.4" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M15.9 12.4H20V16.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

function InkPenIcon() {
  return <ToolIcon icon={EditPencil} />;
}

function BrushIcon() {
  return <ToolIcon icon={DesignPencil} />;
}

function UndoIcon() {
  return <ToolIcon icon={UndoAction} className={styles.zoomIcon} strokeWidth={1.95} />;
}

function RedoIcon() {
  return <ToolIcon icon={RedoAction} className={styles.zoomIcon} strokeWidth={1.95} />;
}

function ResetViewIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.zoomIcon} aria-hidden="true">
      <path
        d="M4.5 12A7.5 7.5 0 1 0 8 5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4.5 6V11H9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StickyNoteIcon() {
  return <ToolIcon icon={PagePlus} />;
}

function TextToolIcon() {
  return <ToolIcon icon={Text} />;
}

function ImageToolIcon() {
  return <ToolIcon icon={MediaImage} />;
}

export function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    pressureSimulation,
    setPressureSimulation,
    zoom,
    setZoom,
    undo,
    redo,
    canUndo,
    canRedo,
    canvas,
  } = useCanvas();

  const [showProperties, setShowProperties] = useState(true);
  const [showShapesDropdown, setShowShapesDropdown] = useState(false);
  const [showPenDropdown, setShowPenDropdown] = useState(false);
  const [showMoreShapes, setShowMoreShapes] = useState(false);
  const [showAllSidebarColors, setShowAllSidebarColors] = useState(false);
  const shapesDropdownRef = useRef<HTMLDivElement>(null);
  const penDropdownRef = useRef<HTMLDivElement>(null);
  const colorTrayRef = useRef<HTMLDivElement>(null);

  const connectorShapeTools = useMemo<ShapeToolOption[]>(
    () => [
      { id: 'line', name: 'Line', shortcut: 'L', icon: <LineIcon /> },
      { id: 'arrow', name: 'Arrow', shortcut: 'A', icon: <ArrowConnectorIcon /> },
      { id: 'elbowArrow', name: 'Elbow Arrow', icon: <ElbowArrowIcon /> },
      { id: 'curvedArrow', name: 'Curved Arrow', icon: <CurvedArrowIcon /> },
    ],
    []
  );

  const shapeGridTools = useMemo<ShapeToolOption[]>(
    () => [
      { id: 'rectangle', name: 'Rectangle', shortcut: 'R', icon: <RectangleIcon /> },
      { id: 'roundedRectangle', name: 'Rounded Rectangle', icon: <RoundedRectangleIcon /> },
      { id: 'circle', name: 'Circle', shortcut: 'C', icon: <CircleIcon /> },
      { id: 'diamond', name: 'Diamond', shortcut: 'D', icon: <DiamondIcon /> },
      { id: 'triangle', name: 'Triangle', icon: <TriangleIcon /> },
      { id: 'star', name: 'Star', icon: <StarIcon /> },
      { id: 'hexagon', name: 'Hexagon', icon: <HexagonIcon /> },
      { id: 'blockArrow', name: 'Block Arrow', icon: <BlockArrowIcon /> },
      { id: 'parallelogram', name: 'Parallelogram', icon: <ParallelogramIcon /> },
    ],
    []
  );

  const visibleShapeTools = useMemo(
    () => shapeGridTools.slice(0, SHAPES_VISIBLE_COUNT),
    [shapeGridTools]
  );

  const hiddenShapeTools = useMemo(
    () => shapeGridTools.slice(SHAPES_VISIBLE_COUNT),
    [shapeGridTools]
  );

  const shapeTools = useMemo(
    () => [...connectorShapeTools, ...shapeGridTools],
    [connectorShapeTools, shapeGridTools]
  );

  const penModes = useMemo<PenModeOption[]>(
    () => [
      {
        id: 'brush',
        name: 'Pen',
        icon: <BrushIcon />,
      },
      {
        id: 'ink',
        name: 'Ink Pen',
        icon: <InkPenIcon />,
      },
    ],
    []
  );

  const utilityTools: ToolbarButtonTool[] = [
    { id: 'text', name: 'Text', shortcut: 'T', icon: <TextToolIcon /> },
    { id: 'image', name: 'Image', shortcut: 'I', icon: <ImageToolIcon /> },
  ];

  const isShapeToolActive = isShapeToolType(activeTool);
  const defaultShape = shapeGridTools.find((shape) => shape.id === 'rectangle') ?? shapeGridTools[0];
  const activeShape = shapeTools.find((shape) => shape.id === activeTool) ?? defaultShape;

  const currentPenMode = pressureSimulation
    ? penModes.find((mode) => mode.id === 'ink')!
    : penModes.find((mode) => mode.id === 'brush')!;

  const visibleSidebarColors = DRAWING_COLORS.slice(0, 4);
  const overflowSidebarColors = DRAWING_COLORS.slice(4);

  useEffect(() => {
    if (!showShapesDropdown && !showPenDropdown && !showAllSidebarColors) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;

      if (
        showShapesDropdown &&
        shapesDropdownRef.current &&
        !shapesDropdownRef.current.contains(event.target)
      ) {
        setShowShapesDropdown(false);
      }

      if (
        showPenDropdown &&
        penDropdownRef.current &&
        !penDropdownRef.current.contains(event.target)
      ) {
        setShowPenDropdown(false);
      }

      if (
        showAllSidebarColors &&
        colorTrayRef.current &&
        !colorTrayRef.current.contains(event.target)
      ) {
        setShowAllSidebarColors(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showShapesDropdown, showPenDropdown, showAllSidebarColors]);

  useEffect(() => {
    if (!showShapesDropdown) {
      setShowMoreShapes(false);
    }
  }, [showShapesDropdown]);

  const handleToolSelect = (toolId: ToolType) => {
    if (toolId === 'image') {
      window.dispatchEvent(new Event(OPEN_IMAGE_PICKER_EVENT));
      setShowShapesDropdown(false);
      setShowPenDropdown(false);
      setShowProperties(true);
      return;
    }

    setActiveTool(toolId);
    setShowShapesDropdown(false);
    setShowPenDropdown(false);
    if (toolId !== 'select') {
      setShowProperties(true);
    }
  };

  const handlePenModeSelect = (mode: PenMode) => {
    setPressureSimulation(mode === 'ink');
    setActiveTool('pen');
    setShowPenDropdown(false);
    setShowProperties(true);
  };

  const handlePenSizeSelect = (mode: PenMode, size: (typeof PEN_SIZE_OPTIONS)[number]) => {
    setPressureSimulation(mode === 'ink');
    setActiveTool('pen');
    setStrokeWidth(size);
    setShowProperties(true);
  };

  const shouldShowStrokeWidth =
    activeTool === 'pen' || isShapeToolType(activeTool);

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
        <button
          type="button"
          onClick={() => handleToolSelect('select')}
          className={`${styles.toolButton} ${activeTool === 'select' ? styles.active : ''}`}
          data-tooltip="Select (V)"
        >
          <CursorIcon />
        </button>

        <button
          type="button"
          onClick={() => handleToolSelect('hand')}
          className={`${styles.toolButton} ${activeTool === 'hand' ? styles.active : ''}`}
          data-tooltip="Hand Tool (H)"
        >
          <HandGrabIcon />
        </button>

        <div className={styles.toolDropdown} ref={penDropdownRef}>
          <button
            type="button"
            onClick={() => {
              if (activeTool === 'pen') {
                setShowPenDropdown((prev) => !prev);
              } else {
                setActiveTool('pen');
                setShowPenDropdown(false);
              }
              setShowProperties(true);
              setShowShapesDropdown(false);
            }}
            className={`${styles.toolButton} ${styles.modeTrigger} ${
              activeTool === 'pen' ? styles.active : ''
            }`}
            data-tooltip={`${currentPenMode.name} (P)`}
            aria-label="Pen mode"
            aria-haspopup="menu"
            aria-expanded={showPenDropdown}
          >
            {currentPenMode.icon}
            <span className={`${styles.dropdownArrow} ${showPenDropdown ? styles.open : ''}`}>
              ▾
            </span>
          </button>

          {showPenDropdown && (
            <div className={styles.toolMenu} role="menu" aria-label="Pen modes">
              {penModes.map((mode) => (
                <div key={mode.id} className={styles.penMenuRow}>
                  <button
                    type="button"
                    onClick={() => handlePenModeSelect(mode.id)}
                    className={`${styles.toolMenuItem} ${styles.penModeButton} ${
                      currentPenMode.id === mode.id ? styles.toolMenuItemActive : ''
                    }`}
                    role="menuitem"
                  >
                    <span className={styles.toolMenuIcon}>{mode.icon}</span>
                    <span className={styles.toolMenuLabel}>{mode.name}</span>
                  </button>

                  <div className={styles.penSizeDots} role="group" aria-label={`${mode.name} sizes`}>
                    {PEN_SIZE_OPTIONS.map((size) => {
                      const isActiveSize = currentPenMode.id === mode.id && strokeWidth === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => handlePenSizeSelect(mode.id, size)}
                          className={`${styles.penSizeDot} ${isActiveSize ? styles.penSizeDotActive : ''}`}
                          title={`${size}px`}
                          aria-label={`${mode.name} ${size}px`}
                        >
                          <span
                            className={`${styles.penSizeCore} ${size === 2 ? styles.penSizeCoreOutline : ''}`}
                            style={{ width: `${size}px`, height: `${size}px` }}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          <button
            type="button"
            onClick={() => handleToolSelect(activeTool === 'sticky' ? 'select' : 'sticky')}
            className={`${styles.toolButton} ${activeTool === 'sticky' ? styles.active : ''}`}
            data-tooltip="Sticky Note (N)"
          >
            <StickyNoteIcon />
          </button>

          <div className={styles.divider} />

          <div className={styles.toolDropdown} ref={shapesDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setShowShapesDropdown((prev) => !prev);
                setShowPenDropdown(false);
              }}
              className={`${styles.toolButton} ${styles.shapeTrigger} ${
                isShapeToolActive ? styles.active : ''
              }`}
              data-tooltip={isShapeToolActive ? `Shapes: ${activeShape.name}` : 'Shapes'}
              aria-label="Shape tools"
              aria-haspopup="menu"
              aria-expanded={showShapesDropdown}
            >
              <GeometricShapesIcon />
              <span className={`${styles.dropdownArrow} ${showShapesDropdown ? styles.open : ''}`}>
                ▾
              </span>
            </button>

            {showShapesDropdown && (
              <div className={styles.shapePanel} role="menu" aria-label="Shape tools">
                <div className={styles.shapeConnectorRow}>
                  {connectorShapeTools.map((shapeTool) => (
                    <button
                      key={shapeTool.id}
                      type="button"
                      onClick={() => handleToolSelect(shapeTool.id)}
                      className={`${styles.shapeIconButton} ${
                        activeTool === shapeTool.id ? styles.shapeIconButtonActive : ''
                      }`}
                      title={shapeTool.shortcut ? `${shapeTool.name} (${shapeTool.shortcut})` : shapeTool.name}
                      role="menuitem"
                      aria-label={shapeTool.name}
                    >
                      {shapeTool.icon}
                    </button>
                  ))}
                </div>

                <div className={styles.shapePanelDivider} />

                <div className={styles.shapeGrid}>
                  {visibleShapeTools.map((shapeTool) => (
                    <button
                      key={shapeTool.id}
                      type="button"
                      onClick={() => handleToolSelect(shapeTool.id)}
                      className={`${styles.shapeTile} ${
                        activeTool === shapeTool.id ? styles.shapeTileActive : ''
                      }`}
                      title={shapeTool.shortcut ? `${shapeTool.name} (${shapeTool.shortcut})` : shapeTool.name}
                      role="menuitem"
                      aria-label={shapeTool.name}
                    >
                      {shapeTool.icon}
                    </button>
                  ))}

                  {showMoreShapes &&
                    hiddenShapeTools.map((shapeTool) => (
                      <button
                        key={shapeTool.id}
                        type="button"
                        onClick={() => handleToolSelect(shapeTool.id)}
                        className={`${styles.shapeTile} ${
                          activeTool === shapeTool.id ? styles.shapeTileActive : ''
                        }`}
                        title={shapeTool.name}
                        role="menuitem"
                        aria-label={shapeTool.name}
                      >
                        {shapeTool.icon}
                      </button>
                    ))}
                </div>

                {hiddenShapeTools.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowMoreShapes((prev) => !prev)}
                    className={styles.moreShapesButton}
                  >
                    {showMoreShapes ? 'Less shapes' : 'More shapes'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.divider} />

          {utilityTools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => handleToolSelect(tool.id)}
              className={`${styles.toolButton} ${activeTool === tool.id ? styles.active : ''}`}
              data-tooltip={`${tool.name} (${tool.shortcut})`}
            >
              {tool.icon}
            </button>
          ))}

          <div className={styles.divider} />

        {activeTool !== 'sticky' && (
          <div className={styles.colorTray} ref={colorTrayRef}>
            <div className={styles.sidebarColors} aria-label="Color palette">
              {visibleSidebarColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setStrokeColor(color)}
                  className={`${styles.sidebarColorButton} ${
                    strokeColor === color ? styles.sidebarColorActive : ''
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {overflowSidebarColors.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllSidebarColors((prev) => !prev)}
                className={styles.sidebarColorToggle}
                title={showAllSidebarColors ? 'Show fewer colors' : 'Show all colors'}
              >
                {showAllSidebarColors ? '−' : '+'}
              </button>
            )}

            {showAllSidebarColors && overflowSidebarColors.length > 0 && (
              <div className={styles.colorPopover} aria-label="Extended color palette">
                {overflowSidebarColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setStrokeColor(color)}
                    className={`${styles.colorPopoverButton} ${
                      strokeColor === color ? styles.colorPopoverButtonActive : ''
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Properties Panel (Bottom Left) */}
      {showProperties && activeTool !== 'select' && activeTool !== 'hand' && (
        <div className={styles.propertiesPanel}>
          {/* Stroke Width */}
          {shouldShowStrokeWidth && (
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
          type="button"
          onClick={undo}
          className={`${styles.zoomButton} ${styles.zoomButtonCompact}`}
          title="Undo (Ctrl/Cmd + Z)"
          disabled={!canUndo}
          aria-label="Undo"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          onClick={redo}
          className={`${styles.zoomButton} ${styles.zoomButtonCompact}`}
          title="Redo (Ctrl/Cmd + Y)"
          disabled={!canRedo}
          aria-label="Redo"
        >
          <RedoIcon />
        </button>
        <div className={styles.zoomDivider} />
        <button
          type="button"
          onClick={handleZoomOut}
          className={styles.zoomButton}
          title="Zoom Out (Ctrl + -)"
        >
          −
        </button>
        <div className={styles.zoomDisplay}>{Math.round(zoom * 100)}%</div>
        <button
          type="button"
          onClick={handleZoomIn}
          className={styles.zoomButton}
          title="Zoom In (Ctrl + +)"
        >
          +
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          className={styles.zoomButton}
          title="Reset Zoom (Ctrl + 0)"
        >
          <ResetViewIcon />
        </button>
      </div>
    </>
  );
}
