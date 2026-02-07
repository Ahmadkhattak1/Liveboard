import React from 'react';
import styles from './Chip.module.css';

interface ChipProps {
  label: string;
  emoji?: string;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function Chip({ label, emoji, onClick, onRemove, className }: ChipProps) {
  const classes = [
    styles.chip,
    onClick || onRemove ? styles.clickable : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={onClick}>
      {emoji && <span className={styles.emoji}>{emoji}</span>}
      <span>{label}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={styles.removeButton}
          aria-label="Remove"
        >
          ✕
        </button>
      )}
    </div>
  );
}
