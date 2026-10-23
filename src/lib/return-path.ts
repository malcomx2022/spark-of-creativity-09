import { notificationPath } from './notification-link';

const KEY = 'domicares.return-to';
const MAX_AGE_MS = 15 * 60_000;
const SUPPRESS_MS = 5_000;

/**
 * Page demandée avant une redirection vers la connexion (session expirée, notification ouverte
 * hors session). Conservée pour l'onglet seulement, 15 minutes au plus, et uniquement pour les
 * chemins internes déjà autorisés aux notifications (/dashboard…, /admin).
 */
export function rememberReturnPath(path: string) {
  const safe = notificationPath(path);
  try {
    // Juste après une déconnexion volontaire, les rendus de ProtectedRoute ne mémorisent rien.
    const current = JSON.parse(window.sessionStorage.getItem(KEY) || 'null') as { suppressedUntil?: unknown } | null;
    if (typeof current?.suppressedUntil === 'number' && current.suppressedUntil > Date.now()) return;
    if (safe) window.sessionStorage.setItem(KEY, JSON.stringify({ path: safe, at: Date.now() }));
    else window.sessionStorage.removeItem(KEY);
  } catch { /* Stockage indisponible ou valeur altérée : retour à l'accueil de l'espace. */ }
}

/** Efface la page mémorisée ; une déconnexion volontaire bloque aussi toute mémorisation 5 s. */
export function clearReturnPath(voluntaryLogout = false) {
  try {
    if (voluntaryLogout) window.sessionStorage.setItem(KEY, JSON.stringify({ suppressedUntil: Date.now() + SUPPRESS_MS }));
    else window.sessionStorage.removeItem(KEY);
  } catch { /* Stockage indisponible. */ }
}

/**
 * Consomme la page mémorisée si elle relève de l'espace du compte connecté
 * (`dashboardPath`, ex. /dashboard/patient) ; /dashboard seul est résolu ensuite par rôle.
 * L'API reste seule juge de l'accès au contenu (un rendez-vous d'un autre compte est refusé).
 */
export function takeReturnPath(dashboardPath: string): string | null {
  let stored: { path?: unknown; at?: unknown } | null;
  try {
    stored = JSON.parse(window.sessionStorage.getItem(KEY) || 'null');
    window.sessionStorage.removeItem(KEY);
  } catch { return null; }
  if (!stored || typeof stored.path !== 'string' || typeof stored.at !== 'number' || Date.now() - stored.at > MAX_AGE_MS || stored.at > Date.now()) return null;
  const path = notificationPath(stored.path);
  if (!path) return null;
  const pathname = path.split('?')[0];
  return pathname === dashboardPath || pathname === '/dashboard' ? path : null;
}

/** Destination après connexion : la page mémorisée compatible, sinon l'accueil de l'espace. */
export function postLoginPath(dashboardPath: string): string {
  return takeReturnPath(dashboardPath) ?? dashboardPath;
}
