import type React from 'react';

const fontSizes = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.25rem',
  xl: '1.5rem',
  xxl: '2rem',
} as const;

const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

type Tag =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'p'
  | 'span'
  | 'strong'
  | 'em'
  | 'code'
  | 'div';
type Size = keyof typeof fontSizes;
type Weight = keyof typeof fontWeights;

export interface TextProps {
  children: React.ReactNode;
  tag?: Tag;
  size?: Size;
  weight?: Weight;
  color?: string;
  align?: 'left' | 'center' | 'right';
  style?: React.CSSProperties;
}

export function Text({
  children,
  tag: Tag = 'span',
  size,
  weight,
  color,
  align,
  style,
}: TextProps) {
  return (
    <Tag
      style={{
        ...(size !== undefined && { fontSize: fontSizes[size] }),
        ...(weight !== undefined && { fontWeight: fontWeights[weight] }),
        ...(color !== undefined && { color }),
        ...(align !== undefined && { textAlign: align }),
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
