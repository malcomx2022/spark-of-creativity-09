import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PwaStatus } from './PwaStatus';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function browser(userAgent: string, platform: string, maxTouchPoints: number, standalone = false) {
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints, onLine: true, standalone });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
}
it('explique l’installation sur iPadOS malgré son agent utilisateur de Mac', () => {
  browser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15', 'MacIntel', 5);
  render(<PwaStatus />);
  expect(screen.getByText(/Sur iPhone ou iPad.*Sur l’écran d’accueil/)).toBeInTheDocument();
});
it('explique l’installation sur iPhone', () => {
  browser('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)', 'iPhone', 5);
  render(<PwaStatus />);
  expect(screen.getByText(/Sur iPhone ou iPad/)).toBeInTheDocument();
});
it('ne propose plus l’installation dans une PWA iOS déjà installée', () => {
  browser('Mozilla/5.0 (iPhone)', 'iPhone', 5, true);
  render(<PwaStatus />);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
it('ne présente pas les instructions iOS sur un Mac sans écran tactile', () => {
  browser('Mozilla/5.0 (Macintosh)', 'MacIntel', 0);
  render(<PwaStatus />);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
