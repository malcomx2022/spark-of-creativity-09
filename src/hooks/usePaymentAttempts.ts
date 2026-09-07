import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PaymentAttempt {
  id: string;
  payment_id: string | null;
  appointment_id: string | null;
  user_id: string;
  attempt_number: number;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  error_type: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
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
      return api.get<PaymentAttempt[]>('/payments/attempts', { query: { appointmentId } });
    },
    enabled: !!appointmentId,
  });
}
