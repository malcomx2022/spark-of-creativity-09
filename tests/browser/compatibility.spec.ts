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

// Onglet DomiCares Academy (praticien et admin) : titres et identifiants longs, sans débordement horizontal.
const longTitle = 'Gestes et postures du soignant à domicile : manutention, prévention des troubles musculosquelettiques et ergonomie';
const academyRoutes: Record<string, unknown> = {
  '/api/config/public': { mapboxToken: null, features: {}, academyEnabled: true },
  '/api/academy/courses': [{ id: 'c1', title: longTitle, description: `${longTitle}. `.repeat(4), type: 'VISIO_CONFERENCE', category: null, publicPrice: null, moduleCount: 12, chapterCount: 48, coverImageUrl: null, presentationUrl: 'https://www.akambiconsulting.com/courses/c1', updatedAt: '2026-10-14T09:30:00.000Z' }, { id: 'c2', title: 'Hygiène', description: null, type: 'E_LEARNING', category: null, publicPrice: null, moduleCount: null, chapterCount: null, coverImageUrl: null, presentationUrl: null, updatedAt: '2026-10-14T09:30:00.000Z' }],
  '/api/academy/enrollments': [{ id: 'enr-1', courseId: 'c1', courseTitle: longTitle, status: 'CERTIFIED', progress: 100, enrolledAt: '2026-10-01T08:00:00.000Z', startedAt: null, lastActivityAt: null, completedAt: '2026-10-20T08:00:00.000Z', hasCertificate: true }],
  '/api/academy/enrollments/enr-1/certificate': { id: 'CERT-GESTES-ET-POSTURES-DU-SOIGNANT-20261020-000123', courseTitle: longTitle, learnerName: 'Nom long de validation navigateur', score: { correctAnswers: 9, totalQuestions: 10 }, completionDate: null, issuedAt: '2026-10-20T08:00:00.000Z', verificationUrl: 'https://www.akambiconsulting.com/attestations/CERT?cle=x' },
  '/api/admin/academy/reports': { akambi: { generatedAt: '', totals: { learners: 42, enrollments: 57, inProgress: 20, completed: 18, certified: 15, averageProgress: 61, completionRate: 32, certificationRate: 26 }, exams: { attempts: 19, passed: 15, passRate: 79 }, courses: [] }, local: { enrollmentsByStatus: {}, learnersByLinkStatus: {}, certificates: 15 } },
  '/api/admin/academy/sync-state': [{ key: 'enrollments', cursor: null, lastRunAt: null, lastSuccessAt: null, lastError: 'Akambi 500 INTERNAL_ERROR — erreur de rapprochement détaillée et longue' }],
  '/api/admin/academy/webhook-events': { total: 0, counts: {}, items: [] },
  '/api/admin/academy/enrollments': { total: 1, page: 0, limit: 25, items: [{ id: 'enr-1', userId: 'u1', learnerName: 'Nom long de validation navigateur', email: 'adresse.electronique.tres.longue.de.validation@domicares.test', accountOrigin: 'CREATED', linkStatus: 'failed', courseId: 'c1', courseTitle: longTitle, status: 'IN_PROGRESS', progress: 40, enrolledAt: null, completedAt: null, hasCertificate: false, lastErrorCode: 'LEARNER_EMAIL_MISMATCH', updatedAt: '2026-10-23T10:00:00.000Z' }] },
};
for (const role of ['practitioner', 'admin'] as const) {
  test(`espace ${role} : onglet Academy sans débordement`, async ({ page, context }) => {
    await isolateServices(context);
    const user = { id: `test-${role}`, email: `${role}@test.invalid`, metadata: { full_name: 'Nom long de validation navigateur' }, createdAt: new Date().toISOString() };
    await context.addInitScript(session => localStorage.setItem('domicares.session', JSON.stringify(session)), { user, accessToken: 'fixture', refreshToken: 'fixture', expiresAt: Date.now() + 3600000 });
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = academyRoutes[path] ?? [];
      if (path.endsWith('/auth/me')) data = { user, role, adminRoles: role === 'admin' ? ['super_admin'] : [], profile: { full_name: user.metadata.full_name } };
      if (path.endsWith('/practitioners/me')) data = { id: 'test-practitioner', user_id: user.id, name: user.metadata.full_name, specialty: 'Généraliste', practitioner_type: 'infirmier', kyc_status: 'approved', can_accept_missions: true, latitude: '6.37030000', longitude: '2.39120000' };
      if (path.endsWith('/appointments/page')) data = { data: [], count: 0 };
      if (path.includes('/stats')) data = {};
      await route.fulfill({ json: data });
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(role === 'admin' ? '/admin?tab=academy' : '/dashboard/practitioner?tab=academy');
      await expect(page.getByRole('tab', { name: /Academy/ })).toHaveAttribute('data-state', 'active');
      await expect(page.getByRole('heading', { name: /DomiCares Academy/ })).toBeVisible();
      if (role === 'practitioner') await expect(page.getByRole('button', { name: /Télécharger le PDF/ })).toBeVisible();
      else await expect(page.getByText('LEARNER_EMAIL_MISMATCH')).toBeVisible();
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
test('PWA : manifeste, fichiers publics et repli privé hors ligne', async ({ page, context, browserName }) => {
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
  if (browserName === 'webkit') {
    // Panne HTTP réelle : le serveur ferme la connexion sans réponse. Le worker
    // doit fournir le repli ; setOffline de Playwright empêche ce traitement WebKit.
    await page.goto('/dashboard/patient?__browser_network_failure=1');
  } else {
    await context.setOffline(true);
    await page.goto('/dashboard/patient');
  }
  await expect(page.getByRole('heading', { name: 'Vous êtes hors ligne' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('safari@test.invalid');
});

});
