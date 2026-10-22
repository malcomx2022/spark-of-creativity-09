const ORIGIN = 'https://domicares.invalid';

/**
 * Chemin interne d'une notification (/dashboard, /dashboard/<rôle>, /admin, paramètres compris),
 * ou null. Même règle que notificationPath côté front ; public/sw.js la revérifie avant d'ouvrir.
 */
export function notificationTargetPath(link?: string | null): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;
  try {
    const url = new URL(link, ORIGIN);
    if (url.origin !== ORIGIN) return null;
    const known = url.pathname === '/dashboard' || /^\/dashboard\/(patient|practitioner|coach)$/.test(url.pathname) || url.pathname === '/admin';
    return known ? `${url.pathname}${url.search}` : null;
  } catch {
    return null;
  }
}

/** Page ouverte au clic d'une notification push : le chemin interne de la notification, sinon /login. */
export function pushTargetPath(link?: string | null): string {
  return notificationTargetPath(link) ?? '/login';
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * E-mail d'une notification : message échappé (il peut contenir des saisies d'utilisateurs) et lien
 * absolu vers la page notifiée. Hors session, la page renvoie vers la connexion, qui y ramène ensuite.
 */
export function notificationEmail(frontendUrl: string, title: string, message: string, link?: string | null) {
  const path = notificationTargetPath(link);
  const url = path ? `${frontendUrl.replace(/\/$/, '')}${path}` : null;
  return {
    subject: title,
    text: `${message}${url ? `\n\n${url}` : ''}`,
    html: `<p>${escapeHtml(message)}</p>${url ? `<p><a href="${escapeHtml(url)}">Ouvrir dans DomiCares</a></p>` : ''}`,
  };
}
