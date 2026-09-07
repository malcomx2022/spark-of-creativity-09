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
