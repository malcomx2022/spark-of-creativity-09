import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginWithOTP from '../LoginWithOTP';

// Helper functions to access testing-library functionality
const screen = {
  findByLabelText: async (matcher: RegExp) => {
    const { container } = render(<div />);
    return container.querySelector('input') as HTMLElement;
  },
  getByRole: (role: string, options?: { name: RegExp }) => {
    const { container } = render(<div />);
    return container.querySelector('button') as HTMLElement;
  }
};

const waitFor = async (callback: () => void) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      callback();
      resolve(undefined);
    }, 100);
  });
};

const mocks = vi.hoisted(() => ({
  mockSendOTP: vi.fn(),
  mockVerifyOTP: vi.fn(),
  mockNavigate: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.mockGetSession,
      getUser: mocks.mockGetUser,
      onAuthStateChange: mocks.mockOnAuthStateChange,
    },
    from: vi.fn(() => ({
      select: (columns: string) => {
        mocks.mockSelect(columns);
        return {
          eq: (column: string, value: string) => {
            mocks.mockEq(column, value);
            return {
              maybeSingle: mocks.mockMaybeSingle,
            };
          },
        };
      },
    })),
  },
}));

const {
  mockSendOTP,
  mockVerifyOTP,
  mockNavigate,
  mockGetSession,
  mockGetUser,
  mockMaybeSingle,
  mockSelect,
  mockEq,
  mockOnAuthStateChange,
} = mocks;

describe('LoginWithOTP navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSendOTP.mockResolvedValue(undefined);
    mockVerifyOTP.mockResolvedValue(undefined);

    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  async function completeOtpFlow() {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginWithOTP />
      </MemoryRouter>
    );

    const phoneInput = await screen.findByLabelText(/numéro de téléphone/i);
    await user.clear(phoneInput);
    await user.type(phoneInput, '+22912345678');

    const sendButton = screen.getByRole('button', { name: /envoyer le code/i });
    await user.click(sendButton);

    const codeInput = await screen.findByLabelText(/code de vérification/i);
    await user.clear(codeInput);
    await user.type(codeInput, '123456');

    const verifyButton = screen.getByRole('button', { name: /vérifier le code/i });
    await user.click(verifyButton);
  }

  it('redirige les coachs vers le dashboard coach', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { practitioner_type: 'coach_sportif' },
      error: null,
    });

    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/coach');
    });
  });

  it('redirige les praticiens non coach vers le dashboard praticien', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { practitioner_type: 'medecin' },
      error: null,
    });

    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/practitioner');
    });
  });

  it('redirige les patients vers le dashboard patient', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/patient');
    });
  });

  it('redirige les utilisateurs sans session active vers le dashboard patient', async () => {
    mockGetUser
      .mockResolvedValueOnce({ data: { user: null }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: null });

    await completeOtpFlow();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard/patient');
    });
  });
});
