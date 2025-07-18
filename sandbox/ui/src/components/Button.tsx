import type React from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  color?: string;
  testId?: string;
}

export function Button({
  children,
  onClick,
  color = '#646cff',
  testId,
}: ButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      style={{
        background: color,
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        padding: '0.5rem 1.25rem',
        fontSize: '1rem',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
