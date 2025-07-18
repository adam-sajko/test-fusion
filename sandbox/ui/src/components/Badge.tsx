import type React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  color: string;
  background: string;
}

export function Badge({ children, color, background }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        borderRadius: '1rem',
        background,
        color,
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.01em',
      }}
    >
      {children}
    </span>
  );
}
