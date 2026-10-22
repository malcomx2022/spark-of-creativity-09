const ORIGIN = 'https://domicares.invalid';
const LEGACY_CARE_NOTE_PATH = '/dashboard/patient?tab=reports';

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
    // Anciennes notifications de note de soin (/patient/appointments/:id, route inexistante).
    if (/^\/patient\/appointments\/[^/]+$/.test(url.pathname)) return LEGACY_CARE_NOTE_PATH;
    const known = url.pathname === '/dashboard' || /^\/dashboard\/(patient|practitioner|coach)$/.test(url.pathname) || url.pathname === '/admin';
    return known ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}
