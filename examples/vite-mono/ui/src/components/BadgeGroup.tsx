import { Badge } from './Badge';

export interface BadgeGroupProps {
  items: string[];
  color: string;
  background: string;
}

export function BadgeGroup({ items, color, background }: BadgeGroupProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {items.map((label) => (
        <Badge key={label} color={color} background={background}>
          {label}
        </Badge>
      ))}
    </div>
  );
}
