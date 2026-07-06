import { render } from '@testing-library/react';
import { Text } from './Text';

describe('Text', () => {
  it('renders as a span by default', () => {
    const { container } = render(<Text>Hello</Text>);
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it.each([
    'h1',
    'h2',
    'h3',
    'h4',
    'p',
    'div',
    'strong',
    'em',
    'code',
  ] as const)('renders as <%s> when tag="%s"', (tag) => {
    const { container } = render(<Text tag={tag}>Hello</Text>);
    expect(container.querySelector(tag)).toBeInTheDocument();
  });
});
