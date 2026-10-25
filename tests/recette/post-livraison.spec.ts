import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, readState, type RecetteState } from './fixtures';

/** Recette post-livraison du document 14, §4 : quatre parcours sur l'API et la base réelles. */
let state: RecetteState;
test.beforeAll(() => { state = readState(); });
const PAYMENT_KEY = 'patient-payment-progress';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log('Diagnostic recette', info.title, page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0, 1500));
});

async function login(page: Page, who: keyof RecetteState['accounts']) {
  const practitioner = who === 'practitioner' || who === 'coach';
  await page.goto(practitioner ? '/practitioner-login' : '/patient-login');
  await page.locator('input[type="email"]').fill(state.accounts[who].email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  const space = who === 'coach' ? 'coach' : practitioner ? 'practitioner' : 'patient';
  await page.waitForURL(new RegExp(`/dashboard/${space}`));
  // L'URL change avant la fin du chargement du tableau de bord (route chargée à la demande, une
  // soixantaine de modules). Un page.goto lancé à ce moment annule ces requêtes, et WebKit restait
  // alors 21 s bloqué sur le document suivant avant « WebKit encountered an internal error »
  // (run 53 du 23 octobre, trace). On laisse le réseau se calmer ; au-delà de 10 s, on continue.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  return space;
}

async function logout(page: Page) {
  // Une progression restaurée rouvre la boîte de paiement (modale) : la fermer d'abord.
  const dialog = page.getByRole('dialog', { name: 'Paiement sécurisé' });
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
  // Sous 768 px (iPhone), le bouton du bureau est masqué : passer par le menu mobile.
  if ((page.viewportSize()?.width ?? 1280) < 768) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('button', { name: /Déconnexion/ }).filter({ visible: true }).first().click();
  await expect.poll(() => new URL(page.url()).pathname).not.toMatch(/^\/dashboard/);
}

const paymentState = (ownerId: string, appointmentId: string) => ({
  version: 2, ownerId,
  state: { appointmentId, amount: 15000, paymentMethod: 'mtn', phoneNumber: '+22900000000', paymentStatus: 'pending', paymentUrl: null, paymentId: null, transactionId: null, expiresAt: null, useSavedMethod: false, selectedSavedMethod: '', lastUpdated: Date.now() },
});

// Notification ciblée par son titre et, si besoin, par son texte : les projets se suivent sur les
// mêmes données et la réponse du chat mobile crée une notification de même titre.
async function openNotification(page: Page, space: string, title: RegExp, text?: string) {
  await page.goto(`/dashboard/${space}?tab=notifications`);
  const link = page.getByRole('link', { name: title });
  await (text ? link.filter({ hasText: text }) : link).first().click();
}

test.describe('1. Déconnexion et connexion entre deux comptes', () => {
  test('la progression de paiement et les données de A disparaissent pour B', async ({ page }) => {
    await login(page, 'patientA');
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [PAYMENT_KEY, JSON.stringify(paymentState(state.accounts.patientA.id, state.recentAppointmentId))]);
    await page.reload();
    // Même compte : la progression est restaurée (la boîte de paiement se rouvre).
    await expect(page.getByRole('dialog', { name: 'Paiement sécurisé' })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), PAYMENT_KEY)).not.toBeNull();

    await logout(page);
    expect(await page.evaluate(key => localStorage.getItem(key), PAYMENT_KEY), 'purge au logout').toBeNull();

    await login(page, 'patientB');
    expect(await page.evaluate(key => localStorage.getItem(key), PAYMENT_KEY)).toBeNull();
    await expect(page.getByRole('dialog', { name: 'Paiement sécurisé' })).toHaveCount(0);
    await page.goto('/dashboard/patient?tab=messages');
    await expect(page.getByText(state.accounts.practitioner.name).first()).toBeVisible();
    await expect(page.getByText(state.accounts.patientA.name)).toHaveCount(0);
    await expect(page.getByText(state.accounts.coach.name)).toHaveCount(0);
    await expect(page.getByText(`Message de la patiente ${state.tag}`)).toHaveCount(0);
  });

  test('une déconnexion dans un autre onglet purge la progression', async ({ page, context }) => {
    await login(page, 'patientA');
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [PAYMENT_KEY, JSON.stringify(paymentState(state.accounts.patientA.id, state.recentAppointmentId))]);
    const other = await context.newPage();
    await other.goto('/dashboard/patient');
    await expect(other.getByRole('dialog', { name: 'Paiement sécurisé' })).toBeVisible();
    await logout(other);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), PAYMENT_KEY)).toBeNull();
    await expect.poll(() => new URL(page.url()).pathname).not.toBe('/dashboard/patient');
  });
});

test.describe('1 bis. Retour à la page après connexion', () => {
  test('lien ouvert hors session : la connexion ramène à la conversation demandée', async ({ page }) => {
    await page.goto(`/dashboard/patient?tab=messages&appointment=${state.oldAppointmentId}`);
    await expect(page).toHaveURL(/\/login$/);
    await login(page, 'patientA');
    await expect(page).toHaveURL(new RegExp(`/dashboard/patient\\?tab=messages&appointment=${state.oldAppointmentId}`));
    await expect(page.getByText(`Message du praticien ${state.tag} (rendez-vous ancien)`).last()).toBeVisible();
  });

  test('page d’un autre espace : le patient arrive sur l’accueil de son espace', async ({ page }) => {
    await page.goto('/dashboard/practitioner?tab=payouts');
    await expect(page).toHaveURL(/\/login$/);
    await login(page, 'patientA');
    await expect(page).toHaveURL(/\/dashboard\/patient$/);
  });

  test('administrateur : la notification /admin?tab=kyc ouvre l’onglet KYC après connexion', async ({ page }) => {
    await page.goto('/admin?tab=kyc');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill(state.accounts.admin.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Connexion administrateur' }).click();
    await expect(page).toHaveURL(/\/admin\?tab=kyc$/);
    await expect(page.getByRole('tab', { name: /KYC/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('déconnexion volontaire : la reconnexion ne rouvre pas l’ancienne page', async ({ page }) => {
    await login(page, 'patientA');
    await page.goto('/dashboard/patient?tab=reports');
    await logout(page);
    await login(page, 'patientA');
    await expect(page).toHaveURL(/\/dashboard\/patient$/);
  });
});

test.describe('2. Notifications de message par rôle', () => {
  test('praticien : la notification ouvre la conversation du patient', async ({ page }) => {
    const space = await login(page, 'practitioner');
    await openNotification(page, space, /Nouveau message de Patiente Alpha/, `Message de la patiente ${state.tag} au praticien`);
    await expect(page).toHaveURL(new RegExp(`/dashboard/practitioner\\?tab=messages&appointment=${state.recentAppointmentId}`));
    await expect(page.getByText(`Message de la patiente ${state.tag} au praticien`).last()).toBeVisible();
  });

  test('coach : la notification ouvre la conversation du rendez-vous individuel', async ({ page }) => {
    const space = await login(page, 'coach');
    await openNotification(page, space, /Nouveau message de Patiente Alpha/, `Message de la patiente ${state.tag} au coach`);
    await expect(page).toHaveURL(new RegExp(`/dashboard/coach\\?tab=messages&appointment=${state.coachAppointmentId}`));
    await expect(page.getByText(`Message de la patiente ${state.tag} au coach`).last()).toBeVisible();
  });

  test('patient : la notification ouvre un rendez-vous hors de la première page', async ({ page }) => {
    const space = await login(page, 'patientA');
    await openNotification(page, space, /Nouveau message de Docteur Gamma/, `Message du praticien ${state.tag} (rendez-vous ancien)`);
    await expect(page).toHaveURL(new RegExp(`/dashboard/patient\\?tab=messages&appointment=${state.oldAppointmentId}`));
    await expect(page.getByText(`Message du praticien ${state.tag} (rendez-vous ancien)`).last()).toBeVisible();
  });

  test('ancienne notification /dashboard : redirection vers l’espace du rôle', async ({ page }) => {
    const space = await login(page, 'patientA');
    await openNotification(page, space, new RegExp(`Ancienne notification ${state.tag}`));
    await expect(page).toHaveURL(new RegExp(`/dashboard/patient\\?tab=messages&appointment=${state.oldAppointmentId}`));
    await expect(page.getByText(`Message du praticien ${state.tag} (rendez-vous ancien)`).last()).toBeVisible();
  });

  test('un tiers ne voit pas la conversation ciblée', async ({ page }) => {
    await login(page, 'patientB');
    await page.goto(`/dashboard/patient?tab=messages&appointment=${state.oldAppointmentId}`);
    await expect(page.getByText(`Message du praticien ${state.tag} (rendez-vous ancien)`)).toHaveCount(0);
    await expect(page.getByText(state.accounts.patientA.name)).toHaveCount(0);
  });
});

test.describe('2 bis. Notification de note de soin', () => {
  for (const [label, title] of [['nouvelle notification', /Nouvelle note de soin/], ['ancien lien /patient/appointments', /Ancienne note de soin/]] as const) {
    test(`${label} : ouvre les notes partagées du patient`, async ({ page }) => {
      const space = await login(page, 'patientA');
      await openNotification(page, space, title);
      await expect(page).toHaveURL(/\/dashboard\/patient\?tab=reports$/);
      await expect(page.getByRole('heading', { name: 'Mes Notes de Soin' })).toBeVisible();
      await page.getByText(`Analyse: Analyse de recette ${state.tag}`).click();
      await expect(page.getByRole('dialog').getByText(`Douleur lombaire ${state.tag}`)).toBeVisible();
    });
  }
});

test.describe('3. Chat mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('la notification ouvre directement le chat du rendez-vous ancien', async ({ page }) => {
    const space = await login(page, 'patientA');
    await openNotification(page, space, /Nouveau message de Docteur Gamma/, `Message du praticien ${state.tag} (rendez-vous ancien)`);
    await expect(page).toHaveURL(new RegExp(`appointment=${state.oldAppointmentId}`));
    await expect(page.getByText(`Message du praticien ${state.tag} (rendez-vous ancien)`).last()).toBeVisible();
    const input = page.getByRole('textbox').last();
    await expect(input).toBeVisible();
    await input.fill(`Réponse mobile ${state.tag}`);
    await input.press('Enter');
    await expect(page.getByText(`Réponse mobile ${state.tag}`).last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  });
});

test.describe('4. Contact public', () => {
  const fill = async (page: Page) => {
    await page.goto('/contact');
    await page.locator('#name').fill(`Recette ${state.tag}`);
    await page.locator('#email').fill(`recette-contact-${state.tag}@domicares.test`);
    await page.locator('#phone').fill('+22990000000');
    await page.locator('#subject').fill(`Recette post-livraison ${state.tag}`);
    await page.locator('#message').fill('Message de recette automatisée : accepté par le fournisseur local.');
  };

  test('envoi accepté par l’API : succès affiché après accepted=true', async ({ page }) => {
    await fill(page);
    const response = page.waitForResponse(r => r.url().endsWith('/api/contact') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /envoyer/i }).click();
    expect((await response).status()).toBe(201);
    await expect(page.getByText('Votre message a été transmis à notre équipe.')).toBeVisible();
  });

  test('échec du fournisseur : erreur visible et champs conservés', async ({ page }) => {
    await page.route('**/api/contact', route => route.fulfill({ status: 503, json: { statusCode: 503, message: 'Service de contact indisponible' } }));
    await fill(page);
    await page.getByRole('button', { name: /envoyer/i }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.locator('#subject')).toHaveValue(`Recette post-livraison ${state.tag}`);
    await expect(page.locator('#message')).not.toHaveValue('');
    await expect(page.getByText('Votre message a été transmis à notre équipe.')).toHaveCount(0);
  });
});
