import { z } from 'zod';

const bool = z
  .string()
  .transform((v) => ['1', 'true', 'yes'].includes(v.toLowerCase()))
  .pipe(z.boolean());

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api'),
  FRONTEND_URL: z.string().url().default('http://localhost:8080'),
  CORS_ORIGINS: z.string().default('http://localhost:8080'),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(30 * 24 * 3600),
  REQUIRE_EMAIL_VERIFICATION: bool.default('true'),
  COOKIE_SECURE: bool.default('false'),

  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default('noreply@domicares.life'),

  OTP_PROVIDER: z.enum(['twilio', 'fake']).default('fake'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
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
  return parsed.data;
}
