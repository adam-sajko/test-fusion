import type React from 'react';

export interface PageLayoutProps {
  children: React.ReactNode;
  background: string;
  testID?: string;
}

export function PageLayout({ children, background, testID }: PageLayoutProps) {
  return (
    <div
      data-testid={testID}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: '30rem' }}>{children}</div>
    </div>
  );
}
