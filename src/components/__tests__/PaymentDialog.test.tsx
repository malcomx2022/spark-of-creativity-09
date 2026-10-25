import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FedaPayCheckoutOptions } from '@/lib/fedapay-widget';
import { PaymentDialog } from '../PaymentDialog';

const mocks = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(readonly status: number, message: string, readonly body?: unknown) { super(message); }
  }
  return {
    FakeApiError,
    get: vi.fn(),
    post: vi.fn(),
    toast: vi.fn(),
    init: vi.fn(),
    open: vi.fn(),
    addPaymentMethod: vi.fn(),
    clearPersisted: vi.fn(),
  };
});

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post },
  auth: { getUser: () => ({ id: 'patient-1', email: 'awa@example.invalid' }), getSession: () => ({ accessToken: 'jeton' }) },
  errorMessage: (error: unknown, fallback?: string) => (error instanceof Error ? error.message : fallback ?? 'Erreur'),
  isApiError: (error: unknown, status?: number) => error instanceof mocks.FakeApiError && (status === undefined || error.status === status),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useSavedPaymentMethods', () => ({
  useSavedPaymentMethods: () => ({ paymentMethods: [], addPaymentMethod: mocks.addPaymentMethod, getDecryptedPhone: vi.fn() }),
}));
vi.mock('@/lib/payment-storage', () => ({ clearPersistedPaymentState: mocks.clearPersisted, getPersistedPaymentState: () => null, setPersistedPaymentState: vi.fn() }));
vi.mock('@/components/PaymentAttemptsHistory', () => ({ PaymentAttemptsHistory: () => null }));
vi.mock('@/lib/fedapay-widget', () => ({
  initFedaPayWidget: mocks.init,
  isFedaPayLoaded: () => true,
  CHECKOUT_COMPLETED: 1,
  DIALOG_DISMISSED: 2,
}));

const APPOINTMENT = 'rdv-1';
const SESSION = 'seance-1';

type Routes = Record<string, unknown>;
function routes(extra: Routes = {}) {
  const table: Routes = {
    '/payments/config': { publicKey: 'pk_sandbox_test', environment: 'sandbox', provider: 'fedapay' },
    '/profile': { full_name: 'Awa Patiente', phone: '+22966000001' },
    [`/appointments/${APPOINTMENT}`]: { id: APPOINTMENT, patient_id: 'patient-1' },
    '/payments': [],
    [`/group-sessions/${SESSION}`]: { my_registration: null },
    ...extra,
  };
  mocks.get.mockImplementation((path: string) => {
    if (path in table) {
      const value = table[path];
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    }
    if (/^\/payments\/[^/]+$/.test(path)) return Promise.resolve({ status: 'pending' });
    return Promise.reject(new Error(`GET inattendu ${path}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routes();
  mocks.init.mockReturnValue({ open: mocks.open, close: vi.fn() });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDialog(props: Partial<Parameters<typeof PaymentDialog>[0]> = {}) {
  const handlers = { onOpenChange: vi.fn(), onSuccess: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
  render(<PaymentDialog open appointmentId={APPOINTMENT} amount={15000} {...handlers} {...props} />);
  return { ...handlers, user: userEvent.setup() };
}

/** Attend la fin de la vérification d'ouverture (formulaire prérempli, bouton Payer actif). */
async function readyToPay() {
  const pay = await screen.findByRole('button', { name: 'Payer' });
  await waitFor(() => expect(pay).toBeEnabled());
  await waitFor(() => expect(screen.getByLabelText('Nom complet du payeur *')).toHaveValue('Awa Patiente'));
  return pay;
}

function widgetOptions(): FedaPayCheckoutOptions {
  expect(mocks.init).toHaveBeenCalledTimes(1);
  return mocks.init.mock.calls[0][0];
}

it("rendez-vous : vérifie qu'il appartient au patient, crée le paiement et ouvre le widget FedaPay", async () => {
  mocks.post.mockResolvedValue({ paymentId: 'pay-1', transactionId: '530207', paymentUrl: 'https://sandbox.fedapay.com/x', status: 'pending' });
  const { user } = renderDialog();
  await user.click(await readyToPay());

  await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
  expect(mocks.get).toHaveBeenCalledWith(`/appointments/${APPOINTMENT}`);
  expect(mocks.post).toHaveBeenCalledWith('/payments', {
    appointmentId: APPOINTMENT,
    amount: 15000,
    paymentMethod: 'mtn',
    phoneNumber: '+22966000001',
    payerName: 'Awa Patiente',
    payerEmail: 'awa@example.invalid',
  }, { timeoutMs: 60_000 });
  expect(widgetOptions()).toMatchObject({
    public_key: 'pk_sandbox_test',
    environment: 'sandbox',
    transaction: { id: 530207, amount: 15000 },
    customer: { phone_number: { number: '66000001', country: 'bj' } },
    currency: { iso: 'XOF' },
    locale: 'fr',
  });
});

it('paiement terminé dans le widget : succès signalé et état persisté purgé', async () => {
  mocks.post.mockResolvedValue({ paymentId: 'pay-1', transactionId: '530207', paymentUrl: 'https://sandbox.fedapay.com/x' });
  const { user, onSuccess, onComplete, onError } = renderDialog();
  await user.click(await readyToPay());
  await waitFor(() => expect(mocks.open).toHaveBeenCalled());

  await widgetOptions().onComplete?.({ reason: 1, transaction: { id: 530207, status: 'approved', amount: 15000, description: '' } });

  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
  expect(mocks.clearPersisted).toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Paiement réussi !' }));
});

it("widget fermé sans payer : le paiement reste en attente, ce n'est pas une erreur", async () => {
  mocks.post.mockResolvedValue({ paymentId: 'pay-1', transactionId: '530207', paymentUrl: 'https://sandbox.fedapay.com/x' });
  const { user, onSuccess, onError } = renderDialog();
  await user.click(await readyToPay());
  await waitFor(() => expect(mocks.open).toHaveBeenCalled());

  await widgetOptions().onComplete?.({ reason: 2, transaction: { id: 530207, status: 'pending', amount: 15000, description: '' } });

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Paiement en attente' })));
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it("rendez-vous d'un autre patient : refus, dialogue fermé, aucun paiement créé", async () => {
  routes({ [`/appointments/${APPOINTMENT}`]: { id: APPOINTMENT, patient_id: 'autre-patient' } });
  const { onOpenChange } = renderDialog();

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Non autorisé', variant: 'destructive' })));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.post).not.toHaveBeenCalled();
});

it('paiement précédent expiré : annulé, puis le formulaire redevient utilisable', async () => {
  const old = new Date(Date.now() - 15 * 60_000).toISOString();
  routes({ '/payments': [{ id: 'pay-old', status: 'pending', patient_id: 'patient-1', created_at: old, fedapay_payment_url: 'https://x', fedapay_transaction_id: '1' }] });
  mocks.post.mockResolvedValue({});
  renderDialog();

  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/payments/pay-old/cancel', {}));
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Paiement expiré' }));
  // Sans quoi l'indicateur « Vérification en cours... » masquait le bouton Payer jusqu'à la réouverture.
  expect(await readyToPay()).toBeInTheDocument();
  expect(screen.queryByText('Vérification en cours...')).toBeNull();
  expect(mocks.init).not.toHaveBeenCalled();
});

it("séance de groupe : inscription payante sans montant transmis (fixé par le serveur)", async () => {
  mocks.post.mockResolvedValue({ paymentId: 'pay-2', transactionId: '530300', paymentUrl: 'https://sandbox.fedapay.com/y' });
  const { user } = renderDialog({ appointmentId: undefined, sessionId: SESSION, context: 'group_session', sessionDetails: { session_name: 'Yoga', scheduled_date: '2026-11-02', start_time: '08:00' } });
  await user.click(await readyToPay());

  await waitFor(() => expect(mocks.open).toHaveBeenCalled());
  expect(mocks.post).toHaveBeenCalledWith(`/group-sessions/${SESSION}/register`, {
    paymentMethod: 'mtn',
    phoneNumber: '+22966000001',
    payerName: 'Awa Patiente',
    payerEmail: 'awa@example.invalid',
  }, { timeoutMs: 60_000 });
  expect(mocks.get).not.toHaveBeenCalledWith(`/appointments/${SESSION}`);
  expect(widgetOptions().transaction).toMatchObject({ id: 530300, description: 'Paiement séance de groupe' });
});

it('paiement déjà en cours (409) : proposé à l’annulation, ni widget ni onError', async () => {
  mocks.post.mockRejectedValue(new mocks.FakeApiError(409, 'Un paiement est déjà en attente', { paymentId: 'pay-0' }));
  const { user, onError } = renderDialog();
  await user.click(await readyToPay());

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Paiement en cours', description: 'Un paiement est déjà en attente', variant: 'destructive' })));
  expect(mocks.init).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it("refus de l'API : erreur remontée à onError, aucun widget ouvert", async () => {
  mocks.post.mockRejectedValue(new mocks.FakeApiError(400, 'Le montant ne correspond pas au tarif'));
  const { user, onError } = renderDialog();
  await user.click(await readyToPay());

  await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Le montant ne correspond pas au tarif' })));
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erreur de paiement' }));
  expect(mocks.init).not.toHaveBeenCalled();
});
