import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the app without crashing', () => {
    const { container } = render(<App />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the welcome heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /Welcome to Webpack App/i }),
    ).toBeInTheDocument();
  });

  it('renders the card section', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /Get Started/i }),
    ).toBeInTheDocument();
  });

  it('renders the stack badges', () => {
    render(<App />);
    expect(screen.getByText('Webpack')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Istanbul')).toBeInTheDocument();
    expect(screen.getByText('Playwright')).toBeInTheDocument();
  });
});
