export interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <span
        style={{
          visibility: 'hidden',
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.25rem 0.5rem',
          borderRadius: '0.25rem',
          background: '#333',
          color: '#fff',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}
