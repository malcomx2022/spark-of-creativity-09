import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';

interface RegisterSessionParams {
  sessionId: string;
  amount: number;
  paymentMethod: string;
  phoneNumber: string;
}

export function useGroupSessionRegistration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const register = useMutation({
    mutationFn: async (params: RegisterSessionParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Vous devez être connecté pour vous inscrire');
      }

      const { data, error } = await withTimeout(
        supabase.functions.invoke(
          'register-group-session',
          {
            body: {
              sessionId: params.sessionId,
              patientId: user.id,
              amount: params.amount,
              paymentMethod: params.paymentMethod,
              phoneNumber: params.phoneNumber,
            }
          }
        )
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erreur lors de l\'inscription');

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      
      toast({
        title: "Inscription en cours",
        description: "Veuillez procéder au paiement pour confirmer votre participation",
      });

      // Rediriger vers le paiement
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    },
    onError: (error: any) => {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        title: "Erreur",
        description: isTimeoutError 
          ? error.message 
          : (error.message || "Impossible de s'inscrire à la séance"),
        variant: "destructive"
      });
    }
  });

  return {
    register: register.mutate,
    isRegistering: register.isPending,
  };
}
