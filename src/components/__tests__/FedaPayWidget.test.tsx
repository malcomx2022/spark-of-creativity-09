import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FedaPayCheckoutOptions, FedaPayCompletePayload } from '@/lib/fedapay-widget';
import { FedaPayWidget } from '../FedaPayWidget';

const mocks = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(readonly status: number, message: string, readonly body?: unknown) { super(message); }
  }
  return {
    FakeApiError,
    get: vi.fn(),
    post: vi.fn(),
    toast: vi.fn(),
    addPaymentMethod: vi.fn(),
    clearPersisted: vi.fn(),
    init: vi.fn(),
  };
});

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post },
  auth: { getUser: () => ({ id: 'patient-1', email: 'awa@example.invalid' }), getSession: () => ({ accessToken: 'jeton' }) },
  errorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
  isApiError: (error: unknown, status?: number) => error instanceof mocks.FakeApiError && (status === undefined || error.status === status),
}));
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useSavedPaymentMethods', () => ({ useSavedPaymentMethods: () => ({ paymentMethods: [], addPaymentMethod: mocks.addPaymentMethod }) }));
vi.mock('@/lib/payment-storage', () => ({ clearPersistedPaymentState: mocks.clearPersisted }));
vi.mock('@/lib/fedapay-widget', () => ({ loadFedaPayCheckout: () => Promise.resolve(true) }));

const APPOINTMENT = '7f1c2e4a-0000-4000-8000-000000000001';

function route(path: string) {
  if (path === '/payments/config') return Promise.resolve({ publicKey: 'pk_sandbox_test', environment: 'sandbox', provider: 'fedapay' });
  if (path === '/profile') return Promise.resolve({ full_name: 'Awa Patiente', phone: '+22966000001' });
  if (path === '/payments') return Promise.resolve([{ id: 'pay-1', status: 'pending' }]);
  return Promise.reject(new Error(`GET inattendu ${path}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(route);
  window.FedaPay = { init: mocks.init, CHECKOUT_COMPLETED: 1, DIALOG_DISMISSED: 2 };
  mocks.init.mockReturnValue({ open: vi.fn(), close: vi.fn() });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderWidget() {
  const props = { onOpenChange: vi.fn(), onSuccess: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  vi.spyOn(client, 'refetchQueries').mockResolvedValue();
  render(
    <QueryClientProvider client={client}>
      <FedaPayWidget open appointmentId={APPOINTMENT} amount={15000} {...props} />
    </QueryClientProvider>,
  );
  return { ...props, user: userEvent.setup() };
}

/** Attend le préremplissage du profil et de la configuration, puis soumet le formulaire. */
async function submit(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByLabelText('Nom complet *')).toHaveValue('Awa Patiente'));
  await screen.findByText(/Mode Test/);
  await user.click(screen.getByRole('button', { name: /^Payer/ }));
}

function initOptions(): FedaPayCheckoutOptions {
  expect(mocks.init).toHaveBeenCalledTimes(1);
  return mocks.init.mock.calls[0][0];
}

it('crée le paiement avec le numéro normalisé puis ouvre le widget FedaPay sur la transaction', async () => {
  mocks.post.mockResolvedValue({ transactionId: '530207', paymentId: 'pay-1' });
  const { user } = renderWidget();
  await submit(user);

  await waitFor(() => expect(mocks.init).toHaveBeenCalled());
  expect(mocks.post).toHaveBeenCalledWith('/payments', {
    appointmentId: APPOINTMENT,
    amount: 15000,
    paymentMethod: 'mtn',
    phoneNumber: '+22966000001',
    payerName: 'Awa Patiente',
    payerEmail: 'awa@example.invalid',
  }, { timeoutMs: 60_000 });
  const options = initOptions();
  expect(options).toMatchObject({
    public_key: 'pk_sandbox_test',
    transaction: { id: 530207, amount: 15000 },
    customer: { email: 'awa@example.invalid', firstname: 'Awa', lastname: 'Patiente', phone_number: { number: '66000001', country: 'bj' } },
    currency: { iso: 'XOF' },
    container: '#fedapay-container',
  });
  expect(screen.getByText('Complétez votre paiement')).toBeInTheDocument();
});

it("refuse un numéro incomplet sans appeler l'API", async () => {
  mocks.get.mockImplementation((path: string) => (path === '/profile' ? Promise.resolve({ full_name: 'Awa Patiente', phone: '+2296600' }) : route(path)));
  const { user } = renderWidget();
  await submit(user);
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.init).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erreur', variant: 'destructive' }));
});

it("signale un paiement déjà en cours (409) sans ouvrir le widget ni appeler onError", async () => {
  mocks.post.mockRejectedValue(new mocks.FakeApiError(409, 'Un paiement est déjà en cours', { paymentId: 'pay-0' }));
  const { user, onError } = renderWidget();
  await submit(user);

  await screen.findByText(/Le paiement a échoué ou a été annulé/);
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '⏳ Paiement déjà en cours', description: 'Un paiement est déjà en cours' }));
  expect(mocks.init).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it("une autre erreur de l'API est remontée à onError et purge l'état de paiement persisté", async () => {
  mocks.post.mockRejectedValue(new mocks.FakeApiError(400, 'Le montant ne correspond pas au tarif'));
  const { user, onError, onSuccess } = renderWidget();
  await submit(user);

  await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Le montant ne correspond pas au tarif' })));
  expect(mocks.clearPersisted).toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
});

it('paiement terminé : succès affiché, méthode enregistrée si demandé, puis synchronisation du paiement', async () => {
  mocks.post.mockImplementation((path: string) => Promise.resolve(path === '/payments' ? { transactionId: 530207 } : {}));
  mocks.addPaymentMethod.mockResolvedValue({});
  const { user, onSuccess, onComplete } = renderWidget();
  await waitFor(() => expect(screen.getByLabelText('Nom complet *')).toHaveValue('Awa Patiente'));
  await user.click(screen.getByLabelText('Enregistrer cette méthode pour plus tard'));
  await submit(user);
  await waitFor(() => expect(mocks.init).toHaveBeenCalled());

  const payload: FedaPayCompletePayload = { reason: 'CHECKOUT COMPLETE', transaction: { id: 530207, status: 'approved', amount: 15000, description: '' } };
  await initOptions().onComplete?.(payload);

  expect(await screen.findByText(/Paiement confirmé !/)).toBeInTheDocument();
  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(mocks.addPaymentMethod).toHaveBeenCalledWith({ provider: 'mtn', phoneNumber: '+22966000001', setAsDefault: true });
  // Le serveur reste la source de vérité : le paiement ouvert est resynchronisé après le retour du widget.
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/payments/pay-1/sync', {}), { timeout: 4000 });
});

it('fenêtre FedaPay fermée : paiement annulé, aucun succès signalé', async () => {
  mocks.post.mockResolvedValue({ transactionId: 530207 });
  const { user, onSuccess } = renderWidget();
  await submit(user);
  await waitFor(() => expect(mocks.init).toHaveBeenCalled());

  await initOptions().onComplete?.({ reason: 2, transaction: { id: 530207, status: 'pending', amount: 15000, description: '' } });

  expect(await screen.findByText(/Le paiement a échoué ou a été annulé/)).toBeInTheDocument();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '❌ Paiement annulé' }));
  expect(onSuccess).not.toHaveBeenCalled();
  expect(mocks.addPaymentMethod).not.toHaveBeenCalled();
});
