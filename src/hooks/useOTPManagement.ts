import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export interface OTPAttempt {
  id: string;
  phone_number: string;
  channel: string;
  status: string;
  created_at: string;
  error_message?: string | null;
  twilio_sid?: string | null;
}

/** Filtres de GET /admin/otp/attempts (pagination et filtrage côté serveur). */
export interface OTPAttemptsParams {
  phone?: string;
  status?: string;
  channel?: string;
  from?: string;
  to?: string;
  /** Index de page à partir de 0. */
  page?: number;
  limit?: number;
}

export interface OTPAttemptsPage {
  data: OTPAttempt[];
  count: number;
}

export interface BlockedNumber {
  phone_number: string;
  attempts: number;
  last_attempt: string;
  blocked_until?: string | null;
}

export function useOTPAttempts(params: OTPAttemptsParams = {}) {
  return useQuery<OTPAttemptsPage>({
    queryKey: ['otp-attempts', params],
    queryFn: async () => {
      const query: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') query[key] = value;
      }
      return api.get<OTPAttemptsPage>('/admin/otp/attempts', { query });
    },
    placeholderData: (previous) => previous,
  });
}

export function useBlockedNumbers() {
  return useQuery<BlockedNumber[]>({
    queryKey: ['blocked-numbers'],
    // Numéros à 3 tentatives ou plus dans la dernière heure, ou bloqués par la limite de débit.
    queryFn: () => api.get<BlockedNumber[]>('/admin/otp/blocked'),
  });
}

export function useResetOTPAttempts() {
  const queryClient = useQueryClient();

  return useMutation({
    // Supprime les tentatives, réinitialise la limite de débit et journalise l'action côté API.
    mutationFn: async (phoneNumber: string) => {
      await api.post('/admin/otp/reset', { phone: phoneNumber });
    },
    onSuccess: (_, phoneNumber) => {
      queryClient.invalidateQueries({ queryKey: ['otp-attempts'] });
      queryClient.invalidateQueries({ queryKey: ['blocked-numbers'] });
      queryClient.invalidateQueries({ queryKey: ['otp-stats'] });
      toast({
        title: 'Tentatives réinitialisées',
        description: `Les tentatives OTP pour ${phoneNumber} ont été supprimées.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de réinitialiser les tentatives.'),
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteOTPAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attemptId: string) => {
      await api.delete(`/admin/otp/attempts/${attemptId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otp-attempts'] });
      queryClient.invalidateQueries({ queryKey: ['blocked-numbers'] });
      queryClient.invalidateQueries({ queryKey: ['otp-stats'] });
      toast({
        title: 'Tentative supprimée',
        description: 'La tentative OTP a été supprimée.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de supprimer la tentative.'),
        variant: 'destructive',
      });
    },
  });
}
