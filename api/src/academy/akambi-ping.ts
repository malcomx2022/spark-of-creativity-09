/**
 * Lot A0 — vérification des identifiants Akambi sans Postman ni base de données
 * (docs/academy/02-RECETTE-PREPRODUCTION.md, prérequis P1).
 *
 * Poste du développeur (préproduction par défaut) :
 *   AKAMBI_API_KEY=… AKAMBI_API_SECRET=… npm run akambi:ping
 * Sur le VPS, avec la configuration réelle du conteneur :
 *   docker compose exec api node dist/academy/akambi-ping.js
 *
 * Contrôles : GET /ping signé (200 et code partenaire), décalage d'horloge avec Akambi (refus au-delà
 * de ±5 min), refus d'une signature fausse (401 INVALID_SIGNATURE), catalogue visible (GET /courses).
 * Aucune clé, aucun secret ni corps de réponse n'est affiché ; code de sortie 1 si un contrôle échoue.
 */
import { configSchema } from '../config/config.schema';
import { AkambiClient, AkambiClientConfig, AkambiError, HttpAkambiClient } from './akambi.client';

export const AKAMBI_PREPROD_URL = 'https://preprod.akambiconsulting.com';

export interface PingCheck {
  label: string;
  ok: boolean;
  /** Avertissement seulement : n'entraîne pas d'échec. */
  warning?: boolean;
  detail: string;
}

const describe = (err: unknown) => (err instanceof AkambiError ? `${err.status} ${err.code}` : err instanceof Error ? err.message : String(err));

/** Configuration lue dans l'environnement ; préproduction Akambi si AKAMBI_BASE_URL est absent. */
export function pingConfig(env: NodeJS.ProcessEnv = process.env): AkambiClientConfig {
  const parsed = configSchema.pick({ AKAMBI_BASE_URL: true, AKAMBI_API_KEY: true, AKAMBI_API_SECRET: true, AKAMBI_TIMEOUT_MS: true }).parse(env);
  const config = { ...parsed, AKAMBI_BASE_URL: parsed.AKAMBI_BASE_URL ?? AKAMBI_PREPROD_URL };
  if (!config.AKAMBI_BASE_URL.startsWith('https://')) throw new Error('AKAMBI_BASE_URL doit être une URL HTTPS');
  if (!config.AKAMBI_API_KEY || !config.AKAMBI_API_SECRET) throw new Error('AKAMBI_API_KEY et AKAMBI_API_SECRET requis (transmis séparément par Akambi)');
  return config;
}

/** `wrongSecret` : même clé, secret volontairement faux (la signature doit être refusée). */
export async function runAkambiPing(client: AkambiClient, wrongSecret: AkambiClient, now: () => number = Date.now): Promise<PingCheck[]> {
  const checks: PingCheck[] = [];
  try {
    const sentAt = now();
    const ping = await client.ping();
    const skew = Math.round((Date.parse(ping.serverTime) - (sentAt + now()) / 2) / 1000);
    checks.push({ label: 'Authentification (GET /ping)', ok: true, detail: `200, partenaire ${ping.partner.code} (${ping.partner.name})` });
    if (Number.isNaN(skew)) checks.push({ label: 'Horloge', ok: true, warning: true, detail: 'serverTime illisible : décalage non mesuré' });
    else if (Math.abs(skew) >= 300) checks.push({ label: 'Horloge', ok: false, detail: `décalage de ${skew} s avec Akambi : requêtes refusées au-delà de ±300 s (NTP)` });
    else checks.push({ label: 'Horloge', ok: true, warning: Math.abs(skew) >= 60, detail: `décalage de ${skew} s avec Akambi (tolérance ±300 s)` });
  } catch (err) {
    checks.push({ label: 'Authentification (GET /ping)', ok: false, detail: `${describe(err)} — vérifier la clé, le secret et l'URL (préproduction ou production)` });
    return checks;
  }
  try {
    await wrongSecret.ping();
    checks.push({ label: 'Refus d’une signature fausse', ok: false, detail: '200 inattendu : Akambi accepte une signature fausse' });
  } catch (err) {
    const expected = err instanceof AkambiError && err.status === 401 && err.code === 'INVALID_SIGNATURE';
    checks.push({ label: 'Refus d’une signature fausse', ok: expected, detail: `${describe(err)}${expected ? '' : ' (attendu 401 INVALID_SIGNATURE)'}` });
  }
  try {
    const page = await client.listCourses({ limit: 100 });
    const titles = page.items.slice(0, 10).map((c) => c.title).join(' ; ');
    checks.push({ label: 'Catalogue (GET /courses)', ok: true, warning: page.pagination.total === 0, detail: page.pagination.total === 0 ? 'aucune formation publiée : demander la formation de test (prérequis P3)' : `${page.pagination.total} formation(s) publiée(s) : ${titles}${page.pagination.total > 10 ? ' …' : ''}` });
  } catch (err) {
    checks.push({ label: 'Catalogue (GET /courses)', ok: false, detail: describe(err) });
  }
  return checks;
}

async function main() {
  let config: AkambiClientConfig;
  try {
    config = pingConfig();
  } catch (err) {
    console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.log(`Akambi : ${config.AKAMBI_BASE_URL}`);
  const checks = await runAkambiPing(new HttpAkambiClient(config), new HttpAkambiClient({ ...config, AKAMBI_API_SECRET: `${config.AKAMBI_API_SECRET}-faux` }));
  for (const c of checks) console.log(`${c.ok ? (c.warning ? '⚠' : '✔') : '✖'} ${c.label} : ${c.detail}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

if (require.main === module) void main();
