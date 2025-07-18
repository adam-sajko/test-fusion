export interface MonogramProps {
  letter: string;
  color: string;
}

export function Monogram({ letter, color }: MonogramProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '3.5rem',
        height: '3.5rem',
        borderRadius: '1rem',
        background: color,
        color: '#fff',
        fontSize: '1.5rem',
        fontWeight: 800,
        marginBottom: '1.25rem',
        boxShadow: `0 0.25rem 1rem ${color}55`,
      }}
    >
      {letter}
    </div>
  );
}
