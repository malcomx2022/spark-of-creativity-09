import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';

interface RetryPaymentParams {
  participantId: string;
  paymentMethod: string;
  phoneNumber: string;
}

interface RetryPaymentResponse {
  success: boolean;
  participantId?: string;
  transactionId?: string;
  paymentUrl?: string;
  error?: string;
}

export function useRetryGroupSessionPayment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const retry = useMutation({
    mutationFn: async (params: RetryPaymentParams): Promise<RetryPaymentResponse> => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Vous devez être connecté pour effectuer un paiement');
      }

      const { data, error } = await withTimeout(
        supabase.functions.invoke(
          'retry-group-session-payment',
          {
            body: {
              participantId: params.participantId,
              paymentMethod: params.paymentMethod,
              phoneNumber: params.phoneNumber,
            }
          }
        )
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erreur lors du retry paiement');

      return {
        success: true,
        participantId: data.participantId,
        transactionId: data.transactionId,
        paymentUrl: data.paymentUrl,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['patient-group-sessions'] });
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError 
          ? error.message 
          : (error.message || "Impossible de reprendre le paiement"),
        variant: "destructive"
      });
    }
  });

  return {
    retryPayment: retry.mutateAsync,
    isRetrying: retry.isPending,
  };
}
