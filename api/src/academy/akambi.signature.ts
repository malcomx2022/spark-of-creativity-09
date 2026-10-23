import { createHmac, timingSafeEqual } from 'crypto';

/** Écart toléré entre l'horodatage signé et l'horloge locale (guide Akambi §3 et §9.2 : 5 minutes). */
export const AKAMBI_CLOCK_TOLERANCE_SECONDS = 300;

/**
 * Signature d'une requête partenaire (guide Akambi §3) :
 * HMAC-SHA256(apiSecret, "{timestamp}.{nonce}.{MÉTHODE}.{chemin et query}.{corps brut}") en hexadécimal.
 * `pathWithQuery` et `body` doivent être exactement ceux envoyés : chaîne vide pour un GET ou un DELETE.
 */
export function signAkambiRequest(secret: string, timestamp: string, nonce: string, method: string, pathWithQuery: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${method.toUpperCase()}.${pathWithQuery}.${body}`).digest('hex');
}

/**
 * Chemin et query tels qu'envoyés et signés : construits une seule fois, sans réencodage ultérieur.
 * Les paramètres `undefined` ou `null` sont omis ; une date est transmise en ISO 8601 UTC (suffixe Z, §4.3).
 */
export function akambiPath(path: string, query: Record<string, string | number | Date | null | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export type WebhookSignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: 'malformed' | 'stale' | 'mismatch' };

/**
 * Vérifie l'en-tête `X-Akambi-Signature: t=…,v1=…[,v1=…]` (guide §9.2) sur le corps brut, avant tout parsing.
 * Chaque secret actif est essayé (rotation : Akambi signe 24 h avec l'ancien et le nouveau). Comparaison en
 * temps constant ; un `t` à plus de 5 minutes de `nowSeconds` est refusé (rejeu).
 */
export function verifyAkambiWebhookSignature(rawBody: Buffer | string, header: string | undefined, secrets: readonly string[], nowSeconds = Date.now() / 1000): WebhookSignatureCheck {
  if (!header || secrets.length === 0) return { ok: false, reason: 'malformed' };
  let timestamp: string | undefined;
  const signatures: Buffer[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === 't' && /^\d+$/.test(value ?? '')) timestamp = value;
    else if (key === 'v1' && /^[a-fA-F0-9]{64}$/.test(value ?? '')) signatures.push(Buffer.from(value.toLowerCase(), 'utf8'));
  }
  if (!timestamp || signatures.length === 0) return { ok: false, reason: 'malformed' };
  if (Math.abs(nowSeconds - Number(timestamp)) > AKAMBI_CLOCK_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  for (const secret of secrets) {
    const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'), 'utf8');
    // Toutes les valeurs ont 64 caractères (regex ci-dessus) : timingSafeEqual ne peut pas lever.
    if (signatures.some((s) => timingSafeEqual(s, expected))) return { ok: true, timestamp: Number(timestamp) };
  }
  return { ok: false, reason: 'mismatch' };
}
