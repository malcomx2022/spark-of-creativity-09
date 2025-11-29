/**
 * Middleware de protection CSRF pour les Edge Functions
 * Vérifie l'origine et le token CSRF
 */

const ALLOWED_ORIGINS = [
  Deno.env.get('FRONTEND_URL'),
  'http://localhost:5173', // Dev
  'http://localhost:3000', // Dev alternative
].filter(Boolean) as string[];

export interface CsrfVerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Vérifie que la requête provient d'une origine autorisée
 * et contient un token CSRF valide
 */
export function verifyCsrfToken(req: Request): CsrfVerificationResult {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const csrfToken = req.headers.get('x-csrf-token');

  // Vérifier l'origine
  const requestOrigin = origin || (referer ? new URL(referer).origin : null);
  
  if (!requestOrigin) {
    return {
      valid: false,
      error: 'Missing origin or referer header'
    };
  }

  if (!ALLOWED_ORIGINS.includes(requestOrigin)) {
    console.warn('CSRF: Blocked request from unauthorized origin:', requestOrigin);
    return {
      valid: false,
      error: 'Unauthorized origin'
    };
  }

  // Vérifier le token CSRF
  if (!csrfToken || csrfToken.length < 32) {
    return {
      valid: false,
      error: 'Missing or invalid CSRF token'
    };
  }

  return { valid: true };
}

/**
 * Headers CORS sécurisés (pas de wildcard)
 */
export function getSecureCorsHeaders(origin?: string | null): Record<string, string> {
  const requestOrigin = origin && ALLOWED_ORIGINS.includes(origin) 
    ? origin 
    : ALLOWED_ORIGINS[0] || '*';

  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-csrf-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
