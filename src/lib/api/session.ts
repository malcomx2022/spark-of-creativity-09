/**
 * Session locale : jetons émis par `POST /api/auth/login|register|otp/verify|refresh`.
 * L'API pose aussi des cookies httpOnly ; le stockage local sert à l'en-tête Bearer, au
 * WebSocket et à la reprise de session au rechargement (ex `persistSession` de supabase-js).
 */
import { API_BASE_URL } from './config';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** Ex `user_metadata` Supabase : full_name, user_type, practitioner_type, pending_onboarding… */
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string | null;
  /** Timestamp (ms) d'expiration du jeton d'accès. */
  expiresAt: number;
  user: AuthUser;
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: AuthUser;
}

export type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
export type AuthListener = (event: AuthEvent, session: AuthSession | null) => void;

const STORAGE_KEY = 'domicares.session';
const REFRESH_MARGIN_MS = 60_000;

let current: AuthSession | null | undefined;
const listeners = new Set<AuthListener>();

function read(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed?.accessToken && parsed.user?.id ? parsed : null;
  } catch {
    return null;
  }
}

function write(session: AuthSession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* stockage indisponible (navigation privée) : la session reste en mémoire */
  }
}

function emit(event: AuthEvent, session: AuthSession | null) {
  for (const l of listeners) {
    try {
      l(event, session);
    } catch (e) {
      console.error('[auth] listener error', e);
    }
  }
}

export function getSession(): AuthSession | null {
  if (current === undefined) current = read();
  return current;
}

export const getAccessToken = (): string | null => getSession()?.accessToken ?? null;
export const getCurrentUser = (): AuthUser | null => getSession()?.user ?? null;
export const sessionExpiresSoon = (): boolean => {
  const s = getSession();
  return !!s && s.expiresAt - Date.now() < REFRESH_MARGIN_MS;
};

export function setSession(response: SessionResponse, event: AuthEvent = 'SIGNED_IN'): AuthSession {
  const session: AuthSession = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? getSession()?.refreshToken ?? null,
    expiresAt: Date.now() + response.expiresIn * 1000,
    user: response.user,
  };
  current = session;
  write(session);
  emit(event, session);
  return session;
}

export function updateSessionUser(user: AuthUser) {
  const s = getSession();
  if (!s) return;
  current = { ...s, user };
  write(current);
  emit('USER_UPDATED', current);
}

export function clearSession(silent = false) {
  const had = getSession() !== null;
  current = null;
  write(null);
  if (had && !silent) emit('SIGNED_OUT', null);
}

/** Abonnement aux changements d'état (ex `supabase.auth.onAuthStateChange`). */
export function onAuthStateChange(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Rotation du refresh token (cookie httpOnly ou jeton stocké). */
export async function refreshSession(): Promise<AuthSession> {
  const s = getSession();
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(s?.refreshToken ? { refreshToken: s.refreshToken } : {}),
  });
  if (!res.ok) throw new Error(`refresh failed (${res.status})`);
  return setSession((await res.json()) as SessionResponse, 'TOKEN_REFRESHED');
}

// Une autre fenêtre du navigateur s'est (dé)connectée : synchroniser l'état local.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = read();
    const wasLoggedIn = !!current;
    current = next;
    if (next && !wasLoggedIn) emit('SIGNED_IN', next);
    else if (!next && wasLoggedIn) emit('SIGNED_OUT', null);
  });
}
