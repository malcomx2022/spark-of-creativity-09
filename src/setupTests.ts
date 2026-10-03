import { afterEach } from 'vitest';
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

// input-otp planifie des minuteurs (0 / 10 / 50 ms, et jusqu'à 6 s) sans tous les annuler au démontage.
// jsdom détruit `window` à la fin du fichier de test et un minuteur tardif faisait échouer toute la suite
// (« ReferenceError: window is not defined » dans react-dom, tests pourtant verts). Les minuteurs encore en
// attente sont annulés après chaque test.
const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
const nativeSetTimeout = globalThis.setTimeout;
const trackedSetTimeout = (handler: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
  const id = nativeSetTimeout(() => {
    pendingTimers.delete(id);
    handler(...args);
  }, delay);
  pendingTimers.add(id);
  return id;
};
(globalThis as { setTimeout: unknown }).setTimeout = Object.assign(trackedSetTimeout, nativeSetTimeout);
afterEach(() => {
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.clear();
});
