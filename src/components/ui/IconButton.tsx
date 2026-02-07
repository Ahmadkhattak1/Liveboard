import React from 'react';
import { cn } from '@/lib/utils/cn';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  emoji: string;
  tooltip?: string;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function IconButton({
  emoji,
  tooltip,
  active = false,
  size = 'md',
  className,
  ...props
}: IconButtonProps) {
  const sizeStyles = {
    sm: 'w-8 h-8 text-base',
    md: 'w-10 h-10 text-lg',
    lg: 'w-12 h-12 text-xl',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-all',
        'hover:bg-light-surface dark:hover:bg-dark-surface',
        'focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent',
        active &&
          'bg-light-accent/10 dark:bg-dark-accent/10 ring-2 ring-light-accent dark:ring-dark-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        sizeStyles[size],
        className
      )}
      title={tooltip}
      aria-label={tooltip}
      {...props}
    >
      <span>{emoji}</span>
    </button>
  );
}
