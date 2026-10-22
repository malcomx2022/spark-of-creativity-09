import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { useLatest } from './useLatest';
afterEach(cleanup);

it('expose la dernière valeur sans relancer un effet qui ne dépend pas d’elle', () => {
  const runs = vi.fn();
  const { result, rerender } = renderHook(({ cb }) => {
    const latest = useLatest(cb);
    useEffect(() => { runs(); }, []);
    return latest;
  }, { initialProps: { cb: (): string => 'premier' } });
  rerender({ cb: () => 'second' });
  expect(runs).toHaveBeenCalledTimes(1);
  expect(result.current.current()).toBe('second');
});

it('est à jour avant les effets passifs du même rendu', () => {
  const seen: string[] = [];
  const { rerender } = renderHook(({ v }) => {
    const latest = useLatest(v);
    useEffect(() => { seen.push(latest.current); }, [v, latest]);
  }, { initialProps: { v: 'a' } });
  rerender({ v: 'b' });
  expect(seen).toEqual(['a', 'b']);
});
