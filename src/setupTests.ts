import '@testing-library/jest-dom/vitest';

// jsdom n'implémente pas ResizeObserver (utilisé par input-otp)
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom n'implémente pas document.elementFromPoint (utilisé par input-otp dans un minuteur)
if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
