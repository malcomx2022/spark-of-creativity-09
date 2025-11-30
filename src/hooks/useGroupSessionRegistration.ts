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

      // ✅ VALIDATION: Vérifier si le patient n'est pas déjà inscrit à cette séance
      const { data: existingParticipation, error: checkError } = await withTimeout(
        supabase
          .from('group_session_participants')
          .select('id, payment_status')
          .eq('session_id', params.sessionId)
          .eq('patient_id', user.id)
          .not('payment_status', 'eq', 'cancelled')
          .maybeSingle()
      );

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Erreur lors de la vérification de l\'inscription:', checkError);
      }

      if (existingParticipation) {
        const statusMessages = {
          pending: 'Vous avez déjà une inscription en attente de paiement pour cette séance. Veuillez compléter le paiement ou annuler l\'inscription.',
          paid: 'Vous êtes déjà inscrit et avez payé pour cette séance.',
          confirmed: 'Vous êtes déjà inscrit à cette séance.'
        };

        throw new Error(
          statusMessages[existingParticipation.payment_status as keyof typeof statusMessages] ||
          'Vous êtes déjà inscrit à cette séance.'
        );
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
