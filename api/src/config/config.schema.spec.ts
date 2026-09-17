import { loadConfig } from './config.schema';

// Configuration minimale acceptée hors production.
const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/d',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

// Configuration complète acceptée en production : les fournisseurs « fake » y sont refusés,
// chacun exige donc ses identifiants.
const prod = {
  ...base,
  NODE_ENV: 'production',
  OTP_PROVIDER: 'twilio',
  SMS_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: 'a',
  TWILIO_AUTH_TOKEN: 'b',
  TWILIO_VERIFY_SERVICE_SID: 'c',
  TWILIO_PHONE_NUMBER: '+1',
  STORAGE_PROVIDER: 's3',
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
  PHONE_ENCRYPTION_KEY: 'p'.repeat(32),
  FEDAPAY_PROVIDER: 'fedapay',
  FEDAPAY_SECRET_KEY: 'sk',
  FEDAPAY_PUBLIC_KEY: 'pk',
  FEDAPAY_WEBHOOK_SECRET: 'wh',
  PUSH_PROVIDER: 'webpush',
  WEB_PUSH_PUBLIC_KEY: 'pub',
  WEB_PUSH_PRIVATE_KEY: 'priv',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're',
};

/** Reproduit la décision prise par createApp (app.factory.ts). */
const documentationPubliee = (env: Record<string, string>) => {
  const config = loadConfig(env as NodeJS.ProcessEnv);
  return config.API_DOCS_ENABLED ?? config.NODE_ENV !== 'production';
};

describe('publication de la documentation OpenAPI', () => {
  it('non renseignée hors production : publiée', () => {
    expect(documentationPubliee(base)).toBe(true);
  });

  it('non renseignée en production : non publiée', () => {
    expect(documentationPubliee(prod)).toBe(false);
  });

  it('chaîne vide : vaut non renseignée, pas false', () => {
    expect(documentationPubliee({ ...base, API_DOCS_ENABLED: '' })).toBe(true);
  });

  it('true en production : publiée', () => {
    expect(documentationPubliee({ ...prod, API_DOCS_ENABLED: 'true' })).toBe(true);
  });

  it('false hors production : non publiée', () => {
    expect(documentationPubliee({ ...base, API_DOCS_ENABLED: 'false' })).toBe(false);
  });
});
