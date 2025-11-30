import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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

      // ✅ VALIDATION ANTI-DOUBLON : Vérifier si le patient est déjà inscrit à cette séance
      const { data: existingParticipation, error: checkError } = await withTimeout(
        supabase
          .from('group_session_participants')
          .select('payment_status, session:group_sessions(session_name, scheduled_date, start_time)')
          .eq('session_id', params.sessionId)
          .eq('patient_id', user.id)
          .neq('payment_status', 'cancelled')
          .maybeSingle()
      );

      if (checkError) throw checkError;

      if (existingParticipation) {
        const session = existingParticipation.session as any;
        const formattedDate = format(new Date(session.scheduled_date), 'EEEE d MMMM yyyy', { locale: fr });
        
        let message = '';
        if (existingParticipation.payment_status === 'pending') {
          message = `Vous avez déjà une inscription en cours de paiement pour la séance "${session.session_name}" du ${formattedDate} à ${session.start_time}.\n\n` +
                   `Veuillez finaliser votre paiement ou annuler cette inscription avant d'en créer une nouvelle.`;
        } else if (existingParticipation.payment_status === 'paid' || existingParticipation.payment_status === 'confirmed') {
          message = `Vous êtes déjà inscrit(e) à la séance "${session.session_name}" du ${formattedDate} à ${session.start_time}.\n\n` +
                   `Vous ne pouvez pas vous inscrire deux fois à la même séance.`;
        } else {
          message = `Vous avez déjà une inscription à cette séance (statut: ${existingParticipation.payment_status}).\n\n` +
                   `Veuillez contacter le support si vous pensez qu'il s'agit d'une erreur.`;
        }
        
        throw new Error(message);
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
