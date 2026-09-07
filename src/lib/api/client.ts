/**
 * Client HTTP de l'API Domicares (NestJS). Remplace `supabase.from(...)`, `supabase.rpc(...)`
 * et `supabase.functions.invoke(...)`.
 *
 * - Base : `VITE_API_URL` (défaut `/api`, servi par le proxy Vite en développement et par Caddy
 *   en production) ;
 * - authentification : cookies httpOnly posés par l'API + en-tête `Authorization: Bearer`
 *   (jeton conservé par `session.ts`) ;
 * - un 401 sur une requête authentifiée déclenche une seule rotation du refresh token, puis la
 *   requête est rejouée ; en cas d'échec la session locale est effacée.
 */
import { clearSession, getAccessToken, refreshSession, sessionExpiresSoon } from './session';
import { API_BASE_URL } from './config';

export { API_BASE_URL };

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;
  readonly code?: string;
  /** Corps JSON complet renvoyé par l'API (ex. `{ paymentId, retryAfter }` sur un 409 de paiement). */
  readonly body?: unknown;

  constructor(status: number, message: string, details?: unknown, code?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
    this.body = body;
  }

  /** Liste lisible des erreurs de validation renvoyées par ZodValidationPipe. */
  get detailMessages(): string[] {
    const d = this.details;
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : (x as { message?: string })?.message ?? JSON.stringify(x)));
    if (d && typeof d === 'object') return Object.values(d as Record<string, unknown>).flat().map(String);
    return [];
  }
}

export const isApiError = (e: unknown, status?: number): e is ApiError => e instanceof ApiError && (status === undefined || e.status === status);

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  /** Paramètres de requête ; les valeurs `undefined`/`null`/'' sont ignorées. */
  query?: Record<string, QueryValue | QueryValue[]>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** `false` pour une route publique (aucun jeton envoyé, pas de tentative de refresh). */
  auth?: boolean;
  /** Délai maximal (ms) avant abandon ; 30 s par défaut, 90 s pour les envois de fichiers. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 30_000;

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    const values = Array.isArray(v) ? v : [v];
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      params.append(k, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(res: Response, body: unknown): ApiError {
  const b = (body ?? {}) as { message?: string | string[]; error?: string; details?: unknown; code?: string; statusCode?: number };
  const message = Array.isArray(b.message) ? b.message.join(', ') : b.message || b.error || res.statusText || `Erreur ${res.status}`;
  return new ApiError(res.status, message, b.details, b.code, body);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Une seule rotation à la fois, partagée entre les requêtes concurrentes. */
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession()
      .then(() => true)
      .catch(() => {
        clearSession();
        return false;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const { query, headers = {}, signal, auth = true, timeoutMs = DEFAULT_TIMEOUT } = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const doFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    signal?.addEventListener('abort', () => controller.abort(), { once: true });
    const token = auth ? getAccessToken() : null;
    try {
      return await fetch(buildUrl(path, query), {
        method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new ApiError(0, 'Délai de connexion dépassé. Vérifiez votre connexion internet et réessayez.');
      throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion internet.');
    } finally {
      clearTimeout(timer);
    }
  };

  // Jeton sur le point d'expirer : rotation préventive, sans attendre un 401.
  if (auth && getAccessToken() && sessionExpiresSoon()) await refreshOnce();

  let res = await doFetch();
  if (res.status === 401 && auth && getAccessToken() && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/login')) {
    const refreshed = await refreshOnce();
    if (refreshed) res = await doFetch();
  }
  const parsed = await parseBody(res);
  if (!res.ok) throw toApiError(res, parsed);
  return parsed as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body ?? {}, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body ?? {}, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body ?? {}, options),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('DELETE', path, body, options),
};

/** Message d'erreur affichable dans un toast, quel que soit le type d'erreur. */
export function errorMessage(error: unknown, fallback = 'Une erreur est survenue'): string {
  if (error instanceof ApiError) {
    const details = error.detailMessages;
    return details.length ? `${error.message} : ${details.join(', ')}` : error.message;
  }
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error;
  return fallback;
}
