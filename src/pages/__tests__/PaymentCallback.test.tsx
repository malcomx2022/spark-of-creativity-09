import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PaymentCallback, { type PaymentCallbackProps } from '../PaymentCallback';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

const payment = (status: string) => ({ id: 'pay-1', status, amount: 15000, currency: 'XOF', appointment_id: 'appt-1', fedapay_transaction_id: '258' });

/** Délais réduits : la page attend 2 s puis relit toutes les 5 s pendant 3 min en production. */
const fast: PaymentCallbackProps = { initialDelayMs: 0, pollIntervalMs: 5, maxWaitMs: 60 };

function renderAt(url: string, props: PaymentCallbackProps = fast) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/payment/callback/:paymentId" element={<PaymentCallback {...props} />} />
        <Route path="/payment/callback" element={<PaymentCallback {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PaymentCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({});
  });

  it('lit l’identifiant du paiement dans le chemin, attend la confirmation puis l’affiche', async () => {
    // La confirmation n'arrive qu'une fois l'état « en attente » observé, pour que le test ne dépende pas d'une course.
    let confirm!: () => void;
    const confirmed = new Promise<void>((resolve) => { confirm = resolve; });
    mocks.get
      .mockResolvedValueOnce(payment('pending'))
      .mockImplementationOnce(async () => { await confirmed; return payment('paid'); })
      .mockResolvedValue(payment('paid'));

    renderAt('/payment/callback/pay-1?id=258&status=approved');

    expect(await screen.findByText(/paiement en attente de confirmation/i)).toBeInTheDocument();
    confirm();
    expect(await screen.findByText(/paiement confirmé !/i)).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/payments/pay-1');
    // Resynchronisation FedaPay demandée à la première relecture d'un paiement en cours.
    expect(mocks.post).toHaveBeenCalledWith('/payments/pay-1/sync');
    expect(screen.queryByText(/paiement non confirmé/i)).not.toBeInTheDocument();
  });

  it('un paiement encore en cours n’est jamais présenté comme un échec, et peut être revérifié à la main', async () => {
    mocks.get.mockResolvedValue(payment('pending'));

    renderAt('/payment/callback/pay-1?id=258&status=approved');

    expect(await screen.findByText(/toujours en attente/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(/paiement non confirmé/i)).not.toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();

    const callsBefore = mocks.post.mock.calls.length;
    mocks.get.mockResolvedValue(payment('paid'));
    await userEvent.setup().click(screen.getByRole('button', { name: /vérifier maintenant/i }));

    expect(await screen.findByText(/paiement confirmé !/i)).toBeInTheDocument();
    expect(mocks.post.mock.calls.length).toBe(callsBefore + 1);
    expect(mocks.post).toHaveBeenLastCalledWith('/payments/pay-1/sync');
  });

  it('un paiement refusé ou annulé affiche l’échec', async () => {
    mocks.get.mockResolvedValue(payment('failed'));

    renderAt('/payment/callback/pay-1?id=258&status=declined');

    expect(await screen.findByText(/paiement non confirmé/i)).toBeInTheDocument();
    expect(screen.getByText('Échoué')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vérifier maintenant/i })).not.toBeInTheDocument();
  });

  it('comprend l’ancienne URL où FedaPay concaténait ses paramètres à appointment_id', async () => {
    mocks.get.mockResolvedValue([payment('paid')]);

    renderAt('/payment/callback?appointment_id=appt-1?id=258&status=approved');

    expect(await screen.findByText(/paiement confirmé !/i)).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/payments', { query: { appointmentId: 'appt-1', limit: 1 } });
  });

  it('signale un paiement introuvable sans l’annoncer comme échoué', async () => {
    mocks.get.mockRejectedValue(new Error('404'));

    renderAt('/payment/callback/pay-404');

    expect(await screen.findByText(/paiement introuvable/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/paiement non confirmé/i)).not.toBeInTheDocument());
  });
});
