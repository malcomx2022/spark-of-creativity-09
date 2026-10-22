const ORIGIN = 'https://domicares.invalid';

/**
 * Page ouverte au clic d'une notification push : le lien interne de la notification
 * (/dashboard, /dashboard/<rôle>, /admin, paramètres compris), sinon /login.
 * Même règle que notificationPath côté front ; public/sw.js la revérifie avant d'ouvrir.
 */
export function pushTargetPath(link?: string | null): string {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return '/login';
  try {
    const url = new URL(link, ORIGIN);
    if (url.origin !== ORIGIN) return '/login';
    const known = url.pathname === '/dashboard' || /^\/dashboard\/(patient|practitioner|coach)$/.test(url.pathname) || url.pathname === '/admin';
    return known ? `${url.pathname}${url.search}` : '/login';
  } catch {
    return '/login';
  }
}
