import React from 'react';
import styles from './Loader.module.css';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Loader({ size = 'md', className }: LoaderProps) {
  const classes = [
    styles.loader,
    styles[size],
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role="status"
      aria-label="Loading"
    />
  );
}
