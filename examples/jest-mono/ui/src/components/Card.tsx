import type React from 'react';

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function Card({ children, title }: CardProps) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '0.75rem',
        padding: '2rem',
        boxShadow: '0 0.125rem 0.5rem rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}
    >
      {title && (
        <h3
          style={{
            margin: '0 0 1.5rem',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#111827',
          }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
