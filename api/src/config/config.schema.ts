import { z } from 'zod';

const bool = z
  .string()
  .transform((v) => ['1', 'true', 'yes'].includes(v.toLowerCase()))
  .pipe(z.boolean());

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),
  // Non renseignée, la documentation OpenAPI suit NODE_ENV : ouverte hors production, fermée
  // en production. La chaîne vide vaut « non renseignée » et non « false », sans quoi une clé
  // présente mais vide dans .env fermerait la documentation jusqu'en développement.
  API_DOCS_ENABLED: z.preprocess((v) => (v === '' ? undefined : v), bool.optional()),
  FRONTEND_URL: z.string().url().default('http://localhost:8080'),
  CORS_ORIGINS: z.string().default('http://localhost:8080'),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(30 * 24 * 3600),
  REQUIRE_EMAIL_VERIFICATION: bool.prefault('true'),
  COOKIE_SECURE: bool.prefault('false'),

  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('noreply@domicares.life'),
  CONTACT_RECIPIENT_EMAIL: z.preprocess(value => value === '' ? undefined : value, z.string().email().optional()),

  OTP_PROVIDER: z.enum(['twilio', 'fake']).default('fake'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  SMS_PROVIDER: z.enum(['twilio', 'console']).default('console'),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['s3', 'fake']).default('fake'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool.prefault('true'),
  S3_BUCKET_DOCUMENTS: z.string().default('documents'),
  S3_BUCKET_AVATARS: z.string().default('avatars'),
  S3_BUCKET_ATTACHMENTS: z.string().default('message-attachments'),
  FILE_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Paiement FedaPay (ex secrets des Edge Functions create-payment / payment-webhook)
  FEDAPAY_PROVIDER: z.enum(['fedapay', 'fake']).default('fake'),
  FEDAPAY_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  FEDAPAY_PUBLIC_KEY: z.string().optional(),
  FEDAPAY_SECRET_KEY: z.string().optional(),
  FEDAPAY_WEBHOOK_SECRET: z.string().optional(),
  APP_BASE_URL: z.string().url().optional(),
  PAYMENT_PENDING_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(2),
  PAYMENT_SLOT_EXPIRY_MINUTES: z.coerce.number().int().positive().default(30),
  PAYMENT_HOLD_PERIOD_DAYS: z.coerce.number().int().nonnegative().default(2),
  PAYMENT_STALE_SYNC_MINUTES: z.coerce.number().int().positive().default(5),
  PAYMENT_STUCK_EXPIRATION_MINUTES: z.coerce.number().int().positive().default(10),
  JOBS_ENABLED: bool.prefault('true'),

  // DomiCares Academy — API partenaires Akambi v1 (docs/academy). Clés distinctes en préproduction et en
  // production, uniquement côté serveur. Une valeur vide dans .env vaut « non renseignée ».
  ACADEMY_ENABLED: bool.prefault('false'),
  AKAMBI_PROVIDER: z.enum(['akambi', 'fake']).default('fake'),
  AKAMBI_BASE_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  AKAMBI_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  AKAMBI_API_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  AKAMBI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  // Secrets de signature des webhooks (whsec_…), séparés par des virgules pendant une rotation (guide § 9.2).
  // Absents : POST /api/webhooks/akambi répond 503 et Akambi retente plus tard.
  AKAMBI_WEBHOOK_SECRETS: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),

  // Push Web (VAPID) : webpush | console
  PUSH_PROVIDER: z.enum(['webpush', 'console']).default('console'),
  WEB_PUSH_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_EMAIL: z.string().default('mailto:admin@domicares.life'),
  // Temps réel (Socket.IO + LISTEN table_changes)
  REALTIME_ENABLED: bool.prefault('true'),
  REALTIME_AUTH_CHECK_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  // Chiffrement des numéros Mobile Money enregistrés (ex secure-phone) : clé AES-256-GCM en base64 (32 octets)
  PHONE_ENCRYPTION_KEY: z.string().optional(),
  /** Jeton public Mapbox exposé au front par GET /config/public (ex Edge Function get-mapbox-token). */
  MAPBOX_TOKEN: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Configuration invalide :\n  ${issues}`);
  }
  if (parsed.data.EMAIL_PROVIDER === 'resend' && !parsed.data.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY requis avec EMAIL_PROVIDER=resend');
  }
  if (
    parsed.data.OTP_PROVIDER === 'twilio' &&
    !(parsed.data.TWILIO_ACCOUNT_SID && parsed.data.TWILIO_AUTH_TOKEN && parsed.data.TWILIO_VERIFY_SERVICE_SID)
  ) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_VERIFY_SERVICE_SID requis avec OTP_PROVIDER=twilio');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.OTP_PROVIDER === 'fake') {
    throw new Error('OTP_PROVIDER=fake est interdit en production');
  }
  if (parsed.data.SMS_PROVIDER === 'twilio' && !(parsed.data.TWILIO_ACCOUNT_SID && parsed.data.TWILIO_AUTH_TOKEN && parsed.data.TWILIO_PHONE_NUMBER)) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_PHONE_NUMBER requis avec SMS_PROVIDER=twilio');
  }
  if (parsed.data.STORAGE_PROVIDER === 's3' && !(parsed.data.S3_ACCESS_KEY && parsed.data.S3_SECRET_KEY)) {
    throw new Error('S3_ACCESS_KEY et S3_SECRET_KEY requis avec STORAGE_PROVIDER=s3');
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.PHONE_ENCRYPTION_KEY) {
    throw new Error('PHONE_ENCRYPTION_KEY requis en production (moyens de paiement enregistrés)');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.STORAGE_PROVIDER === 'fake') {
    throw new Error('STORAGE_PROVIDER=fake est interdit en production');
  }
  if (parsed.data.FEDAPAY_PROVIDER === 'fedapay' && !(parsed.data.FEDAPAY_SECRET_KEY && parsed.data.FEDAPAY_PUBLIC_KEY && parsed.data.FEDAPAY_WEBHOOK_SECRET)) {
    throw new Error('FEDAPAY_SECRET_KEY, FEDAPAY_PUBLIC_KEY et FEDAPAY_WEBHOOK_SECRET requis avec FEDAPAY_PROVIDER=fedapay');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.FEDAPAY_PROVIDER === 'fake') {
    throw new Error('FEDAPAY_PROVIDER=fake est interdit en production');
  }
  if (parsed.data.AKAMBI_PROVIDER === 'akambi' && !(parsed.data.AKAMBI_BASE_URL && parsed.data.AKAMBI_API_KEY && parsed.data.AKAMBI_API_SECRET)) {
    throw new Error('AKAMBI_BASE_URL, AKAMBI_API_KEY et AKAMBI_API_SECRET requis avec AKAMBI_PROVIDER=akambi');
  }
  if (parsed.data.AKAMBI_PROVIDER === 'akambi' && !parsed.data.AKAMBI_BASE_URL?.startsWith('https://')) {
    throw new Error('AKAMBI_BASE_URL doit être une URL HTTPS');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.ACADEMY_ENABLED && parsed.data.AKAMBI_PROVIDER === 'fake') {
    throw new Error('AKAMBI_PROVIDER=fake est interdit en production avec ACADEMY_ENABLED=true');
  }
  if (parsed.data.PUSH_PROVIDER === 'webpush' && !(parsed.data.WEB_PUSH_PUBLIC_KEY && parsed.data.WEB_PUSH_PRIVATE_KEY)) {
    throw new Error('WEB_PUSH_PUBLIC_KEY et WEB_PUSH_PRIVATE_KEY requis avec PUSH_PROVIDER=webpush');
  }
  return parsed.data;
}
