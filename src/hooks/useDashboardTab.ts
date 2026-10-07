import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/** Une notification, un clic d'onglet et le bouton Retour partagent le même état. */
export function useDashboardTab(allowed: readonly string[], fallback: string) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') ?? '';
  const active = allowed.includes(requested) ? requested : fallback;
  const select = useCallback((tab: string) => {
    if (!allowed.includes(tab)) return;
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('tab', tab);
      if (tab !== 'messages') next.delete('appointment');
      return next;
    });
  }, [allowed, setParams]);
  return [active, select] as const;
}
