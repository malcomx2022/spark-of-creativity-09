const ORIGIN = 'https://domicares.invalid';

/**
 * Chemin interne à ouvrir au clic d'une notification, ou null.
 * Seuls les espaces /dashboard… et /admin sont suivis : un lien externe (URL de paiement)
 * ou vers une route inexistante laisse la notification simplement marquée comme lue.
 */
export function notificationPath(link?: string | null): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;
  try {
    const url = new URL(link, ORIGIN);
    if (url.origin !== ORIGIN) return null;
    const known = url.pathname === '/dashboard' || /^\/dashboard\/(patient|practitioner|coach)$/.test(url.pathname) || url.pathname === '/admin';
    return known ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}
