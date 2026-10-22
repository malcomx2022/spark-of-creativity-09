import { useLayoutEffect, useRef } from 'react';

/**
 * Ref toujours à jour de `value`, pour un rappel déclenché plus tard (widget de paiement, délai)
 * sans en faire une dépendance d'effet : l'effet garde ses déclencheurs, le rappel lit les
 * dernières props. Mise à jour en effet de layout, donc avant tout effet passif du même rendu.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
