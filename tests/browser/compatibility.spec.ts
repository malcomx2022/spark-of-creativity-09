import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    console.log('Diagnostic navigateur', info.project.name, info.title, await page.locator('body').innerText().catch(() => 'page indisponible'));
  }
});

async function isolateServices(context: BrowserContext) {
  await context.route('https://cdn.fedapay.com/**', route => route.abort());
  await context.route('**/socket.io/**', route => route.abort());
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/practitioners') return route.fulfill({ json: [] });
    if (path === '/api/group-sessions') return route.fulfill({ json: { data: [], count: 0 } });
    return route.fulfill({ status: 503, json: { message: 'API isolée pour le test navigateur' } });
  });
}
async function checkLayout(page: Page) {
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
}

for (const width of [320, 390, 768, 1280]) {
  for (const path of ['/', '/login', '/patient-login', '/signup/patient', '/signup/practitioner', '/search-coaches', '/contact', '/triage']) {
    test(`${path} sans débordement à ${width}px`, async ({ page, context }) => {
      await isolateServices(context);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path);
      await checkLayout(page);
      await expect(page.getByRole('heading').first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

for (const role of ['patient', 'practitioner', 'coach', 'admin']) {
  test(`espace ${role} : portrait et paysage`, async ({ page, context }) => {
    await isolateServices(context);
    const user = { id: `test-${role}`, email: `${role}@test.invalid`, metadata: { full_name: 'Nom long de validation navigateur', patient_onboarding_completed: true }, createdAt: new Date().toISOString() };
    await context.addInitScript(session => localStorage.setItem('domicares.session', JSON.stringify(session)), { user, accessToken: 'fixture', refreshToken: 'fixture', expiresAt: Date.now() + 3600000 });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/auth/me')) data = { user, role, adminRoles: role === 'admin' ? ['super_admin'] : [], profile: { full_name: user.metadata.full_name } };
      if (path.endsWith('/practitioners/me')) data = { id: 'test-practitioner', user_id: user.id, name: user.metadata.full_name, specialty: 'Généraliste', practitioner_type: role === 'coach' ? 'coach_sportif' : 'medecin', kyc_status: 'approved', can_accept_missions: true, latitude: '6.37030000', longitude: '2.39120000' };
      if (path.endsWith('/appointments/page') || path.includes('/group-sessions')) data = { data: [], count: 0 };
      if (path.includes('/stats')) data = {};
      await route.fulfill({ json: data });
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(role === 'admin' ? '/admin' : `/dashboard/${role}`);
      await expect(page.getByRole('tab').first()).toBeVisible();
      await checkLayout(page);
    }
    expect(errors).toEqual([]);
  });
}

test('formulaire mobile : champs lisibles et focus conservé', async ({ page, context }) => {
  await isolateServices(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/patient-login');
  const email = page.locator('input[type="email"]');
  await email.fill('safari@test.invalid');
  await expect(email).toBeFocused();
  expect(await email.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 390, height: 450 });
  await expect(page.getByRole('button', { name: /se connecter/i }).last()).toBeVisible();
  await checkLayout(page);
  await page.goto('/contact');
  const message = page.locator('textarea');
  await message.fill('Test de lisibilité et de focus Safari');
  await expect(message).toBeFocused();
  expect(await message.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
});

test.describe('Service worker réel', () => {
  test.use({ serviceWorkers: 'allow' });
test('PWA : manifeste, fichiers publics et repli privé hors ligne', async ({ page, context }) => {
  // Aucune interception réseau : WebKit contourne le worker lors d'une navigation
  // hors ligne si le contexte Playwright intercepte les requêtes.
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const result = await page.evaluate(async () => {
    const manifest = await (await fetch('/manifest.webmanifest')).json();
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
    }
    return { manifest, paths };
  });
  expect(result.manifest.display).toBe('standalone');
  expect(result.paths.sort()).toEqual(['/offline.html', '/manifest.webmanifest', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/icon-maskable.png', '/pwa/apple-touch-icon.png'].sort());
  await page.evaluate(() => history.replaceState(null, '', '/dashboard/patient'));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(error => {
    if (!String(error).includes('WebKit encountered an internal error')) throw error;
    // WebKit peut rejeter goto alors que la réponse du worker a été affichée.
    // L'assertion suivante reste obligatoire et vérifie le DOM réellement rendu.
    console.log('Navigation WebKit hors ligne : vérification du contenu après erreur de transport');
  });
  await expect(page.getByRole('heading', { name: 'Vous êtes hors ligne' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('safari@test.invalid');
});

});
