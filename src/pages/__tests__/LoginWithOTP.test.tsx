import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginWithOTP from '../LoginWithOTP';

const mocks = vi.hoisted(() => ({
  mockSendOTP: vi.fn(),
  mockVerifyOTP: vi.fn(),
  mockNavigate: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockMe: vi.fn(),
}));

vi.mock('@/hooks/useOTPAuth', () => ({
  useOTPAuth: () => ({
    sendOTP: mocks.mockSendOTP,
    verifyOTP: mocks.mockVerifyOTP,
    sendingOTP: false,
    verifyingOTP: false,
    phoneStored: '',
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.mockNavigate,
  };
});

// Client API : la session locale et la résolution de rôle (`GET /api/auth/me`) sont simulées
vi.mock('@/lib/api', () => ({
  auth: {
    getSession: mocks.mockGetSession,
    getUser: mocks.mockGetUser,
    me: mocks.mockMe,
    onAuthStateChange: () => () => undefined,
    signOut: vi.fn(),
  },
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown, fallback = '') => (e instanceof Error ? e.message : fallback),
  isApiError: () => false,
}));

const { mockSendOTP, mockVerifyOTP, mockNavigate, mockGetSession, mockGetUser, mockMe } = mocks;

const user = { id: 'user-1', email: 'u@test.com', phone: '+22912345678', emailVerified: true, phoneVerified: true, metadata: {}, createdAt: '' };

describe('LoginWithOTP navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSendOTP.mockResolvedValue(undefined);
    mockVerifyOTP.mockResolvedValue(undefined);
    mockGetSession.mockReturnValue(null);
    mockGetUser.mockReturnValue(user);
    mockMe.mockResolvedValue({ user, profile: null, role: 'patient', source: 'default', adminRoles: [] });
  });

  async function completeOtpFlow() {
    const ue = userEvent.setup();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <LoginWithOTP />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const phoneInput = await screen.findByLabelText(/numéro de téléphone/i);
    await ue.clear(phoneInput);
    await ue.type(phoneInput, '+22912345678');

    await ue.click(screen.getByRole('button', { name: /envoyer le code/i }));

    const codeInput = await screen.findByLabelText(/code de vérification/i);
    await ue.clear(codeInput);
    await ue.type(codeInput, '123456');

    await ue.click(screen.getByRole('button', { name: /vérifier le code/i }));
  }

  it('redirige les coachs vers le dashboard coach', async () => {
    mockMe.mockResolvedValue({ user, profile: null, role: 'coach', source: 'practitioners', adminRoles: [] });

    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/coach', { replace: true });
    });
  });

  it('redirige les praticiens non coach vers le dashboard praticien', async () => {
    mockMe.mockResolvedValue({ user, profile: null, role: 'practitioner', source: 'practitioners', practitionerType: 'medecin', adminRoles: [] });

    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/practitioner', { replace: true });
    });
  });

  it('redirige les patients vers le dashboard patient', async () => {
    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/patient', { replace: true });
    });
  });

  it('redirige les utilisateurs sans session active vers le dashboard patient', async () => {
    mockGetUser.mockReturnValue(null);
    mockMe.mockResolvedValue(null);

    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/patient', { replace: true });
    });
  });
});
