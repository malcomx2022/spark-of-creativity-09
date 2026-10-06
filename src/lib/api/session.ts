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
let storageReadable = true;

function read(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    storageReadable = true;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    return parsed?.accessToken && parsed.user?.id ? parsed : null;
  } catch {
    storageReadable = false;
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
let rotation: Promise<AuthSession> | null = null;

export function refreshSession(): Promise<AuthSession> {
  if (rotation) return rotation;
  const previous = getSession();
  const rotate = async () => {
    // Le verrou Web Locks est partagé entre onglets de la même origine.
    const stored = read();
    if (previous && stored && stored.refreshToken !== previous.refreshToken) {
      current = stored;
      emit(stored.user.id === previous.user.id ? 'TOKEN_REFRESHED' : 'SIGNED_IN', stored);
      return stored;
    }
    if (previous && !stored && storageReadable) throw new Error('Session fermée dans un autre onglet');
    const s = stored ?? previous;
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(s?.refreshToken ? { refreshToken: s.refreshToken } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`refresh failed (${res.status})`);
    // Une déconnexion concurrente ne doit pas ressusciter la session locale.
    const latest = read();
    if (previous && storageReadable && (!latest || latest.user.id !== previous.user.id)) throw new Error('Session fermée pendant le renouvellement');
    return setSession((await res.json()) as SessionResponse, 'TOKEN_REFRESHED');
  };
  rotation = (async () => {
    // Web Locks types describe the callback's own return value; await flattens its promise.
    return typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request('domicares-session-refresh', rotate)
      : await rotate();
  })().finally(() => { rotation = null; });
  return rotation;
}

// Une autre fenêtre du navigateur s'est (dé)connectée : synchroniser l'état local.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = read();
    const previous = current;
    current = next;
    if (next && (!previous || previous.user.id !== next.user.id)) emit('SIGNED_IN', next);
    else if (!next && previous) emit('SIGNED_OUT', null);
    else if (next && previous?.refreshToken !== next.refreshToken) emit('TOKEN_REFRESHED', next);
  });
}
