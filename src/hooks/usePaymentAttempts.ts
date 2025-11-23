import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/lib/network-timeout';

export interface PaymentAttempt {
  id: string;
  payment_id: string | null;
  appointment_id: string | null;
  user_id: string;
  attempt_number: number;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  error_type: string | null;
  error_message: string | null;
  error_details: Record<string, any> | null;
  payment_method: string;
  amount: number;
  retry_after: string | null;
  created_at: string;
  completed_at: string | null;
}

export function usePaymentAttempts(appointmentId?: string) {
  return useQuery({
    queryKey: ['payment-attempts', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return [];
      
      const { data, error } = await withTimeout(
        supabase
          .from('payment_attempts')
          .select('*')
          .eq('appointment_id', appointmentId)
          .order('created_at', { ascending: false })
      );

      if (error) {
        console.error('Error fetching payment attempts:', error);
        throw error;
      }

      return data as PaymentAttempt[];
    },
    enabled: !!appointmentId,
  });
}
