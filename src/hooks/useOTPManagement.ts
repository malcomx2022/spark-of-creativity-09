import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface OTPAttempt {
  id: string;
  phone_number: string;
  channel: string;
  status: string;
  created_at: string;
  error_message?: string;
  twilio_sid?: string;
}

export function useOTPAttempts() {
  return useQuery<OTPAttempt[]>({
    queryKey: ['otp-attempts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('otp_attempts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
  });
}

export function useBlockedNumbers() {
  return useQuery<{ phone_number: string; attempts: number; last_attempt: string }[]>({
    queryKey: ['blocked-numbers'],
    queryFn: async () => {
      // Get numbers with multiple failed attempts in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('otp_attempts')
        .select('phone_number, created_at, status')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by phone number and count attempts
      const grouped = (data || []).reduce((acc: Record<string, any>, attempt) => {
        const phone = attempt.phone_number;
        if (!acc[phone]) {
          acc[phone] = {
            phone_number: phone,
            attempts: 0,
            last_attempt: attempt.created_at,
          };
        }
        acc[phone].attempts += 1;
        if (attempt.created_at > acc[phone].last_attempt) {
          acc[phone].last_attempt = attempt.created_at;
        }
        return acc;
      }, {});

      // Return only numbers with 3+ attempts (potentially blocked)
      return Object.values(grouped).filter((entry: any) => entry.attempts >= 3);
    },
  });
}

export function useResetOTPAttempts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (phoneNumber: string) => {
      const { error } = await supabase
        .from('otp_attempts')
        .delete()
        .eq('phone_number', phoneNumber);

      if (error) throw error;
    },
    onSuccess: (_, phoneNumber) => {
      queryClient.invalidateQueries({ queryKey: ['otp-attempts'] });
      queryClient.invalidateQueries({ queryKey: ['blocked-numbers'] });
      toast({
        title: 'Tentatives réinitialisées',
        description: `Les tentatives OTP pour ${phoneNumber} ont été supprimées.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de réinitialiser les tentatives.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteOTPAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attemptId: string) => {
      const { error } = await supabase
        .from('otp_attempts')
        .delete()
        .eq('id', attemptId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otp-attempts'] });
      queryClient.invalidateQueries({ queryKey: ['blocked-numbers'] });
      toast({
        title: 'Tentative supprimée',
        description: 'La tentative OTP a été supprimée.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de supprimer la tentative.',
        variant: 'destructive',
      });
    },
  });
}
