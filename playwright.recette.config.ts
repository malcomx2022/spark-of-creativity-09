import { defineConfig, devices } from '@playwright/test';

/**
 * Recette post-livraison du document 14 (§4), automatisée sur une pile LOCALE réelle :
 * API compilée (fournisseurs factices) + front en preview + PostgreSQL de développement.
 *   RECETTE_DATABASE_URL=postgresql://…@localhost:5432/<base dédiée> npm run test:recette
 * Ne jamais viser une base de production : la recette crée des comptes, rendez-vous et messages.
 * La suite tests/browser reste isolée des services ; celle-ci, au contraire, n'intercepte rien.
 */
const API_PORT = 3100;
const chromiumLaunch = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {};
const WEB_PORT = 4174;
const databaseUrl = process.env.RECETTE_DATABASE_URL ?? '';
// Garde avant tout démarrage de serveur : base explicite et locale (ou service « postgres » de CI).
const databaseHost = (() => { try { return new URL(databaseUrl).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(databaseHost)) {
  throw new Error('RECETTE_DATABASE_URL doit désigner une base PostgreSQL de développement locale (localhost, 127.0.0.1, ::1 ou postgres)');
}

export default defineConfig({
  testDir: './tests/recette',
  globalSetup: './tests/recette/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/recette' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, serviceWorkers: 'block', trace: 'retain-on-failure', locale: 'fr-FR' },
  // Projets joués l'un après l'autre sur les mêmes données. webkit-iphone (moteur de Safari, émulation
  // iPhone 13) tourne en CI ; chromium-iphone donne le même gabarit là où WebKit n'est pas installable.
  // Ni l'un ni l'autre ne remplace la recette sur iPhone physique (document 12).
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch } },
    { name: 'chromium-iphone', use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions: chromiumLaunch } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: [
    {
      command: 'npm --prefix api run build && node api/dist/main.js',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl,
        JWT_ACCESS_SECRET: process.env.RECETTE_JWT_SECRET ?? 'recette-locale-recette-locale-recette-0001',
        FRONTEND_URL: `http://127.0.0.1:${WEB_PORT}`,
        CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
        REQUIRE_EMAIL_VERIFICATION: 'false',
        EMAIL_PROVIDER: 'console',
        CONTACT_RECIPIENT_EMAIL: 'recette-contact@domicares.test',
        OTP_PROVIDER: 'fake',
        SMS_PROVIDER: 'console',
        PUSH_PROVIDER: 'console',
        STORAGE_PROVIDER: 'fake',
        FEDAPAY_PROVIDER: 'fake',
        JOBS_ENABLED: 'false',
      },
    },
    {
      command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: { VITE_DEV_API_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
