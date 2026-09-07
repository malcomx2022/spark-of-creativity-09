import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, auth, errorMessage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface RetryPaymentParams {
  participantId: string;
  paymentMethod: string;
  phoneNumber: string;
}

interface RetryPaymentResponse {
  success: boolean;
  participantId?: string;
  paymentId?: string;
  transactionId?: string;
  token?: string;
  paymentUrl?: string;
  amount?: number;
  reused?: boolean;
  error?: string;
}

/** Ex Edge Function retry-group-session-payment : `POST /api/group-sessions/registrations/:participantId/retry-payment`. */
export function useRetryGroupSessionPayment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const retry = useMutation({
    mutationFn: async (params: RetryPaymentParams): Promise<RetryPaymentResponse> => {
      if (!auth.getUser()) {
        throw new Error('Vous devez être connecté pour effectuer un paiement');
      }

      const data = await api.post<RetryPaymentResponse>(`/group-sessions/registrations/${params.participantId}/retry-payment`, {
        paymentMethod: params.paymentMethod,
        phoneNumber: params.phoneNumber,
      });

      if (!data.success) throw new Error(data.error || 'Erreur lors du retry paiement');

      return {
        success: true,
        participantId: data.participantId,
        paymentId: data.paymentId,
        transactionId: data.transactionId,
        token: data.token,
        paymentUrl: data.paymentUrl,
        amount: data.amount,
        reused: data.reused,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['patient-group-sessions'] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de reprendre le paiement"),
        variant: "destructive"
      });
    }
  });

  return {
    retryPayment: retry.mutateAsync,
    isRetrying: retry.isPending,
  };
}
