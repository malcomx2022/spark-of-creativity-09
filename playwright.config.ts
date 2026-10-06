import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  expect: { timeout: 10_000 },
  workers: process.env.CI ? 2 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'webkit-ipad', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} } },
  ],
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', port: 4173, env: { DOMICARES_BROWSER_TEST: '1' }, reuseExistingServer: !process.env.CI },
});
