import React from 'react';
import { cn } from '@/lib/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={props.id}
          className="block text-sm font-medium text-light-text dark:text-dark-text mb-1"
        >
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full px-3 py-2 rounded-lg border transition-colors',
          'bg-light-bg dark:bg-dark-bg',
          'border-light-border dark:border-dark-border',
          'text-light-text dark:text-dark-text',
          'placeholder:text-light-text-secondary dark:placeholder:text-dark-text-secondary',
          'focus:outline-none focus:ring-2 focus:ring-light-accent dark:focus:ring-dark-accent',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
