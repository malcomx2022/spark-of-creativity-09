import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, auth, errorMessage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface RegisterSessionParams {
  sessionId: string;
  /** Montant indicatif : l'API applique le prix de la séance. */
  amount: number;
  paymentMethod: string;
  phoneNumber: string;
}

interface RegisterSessionResponse {
  success: boolean;
  participantId?: string;
  paymentId?: string;
  transactionId?: string;
  token?: string;
  paymentUrl?: string;
  amount?: number;
  error?: string;
}

/**
 * Inscription à une séance de groupe (ex Edge Function register-group-session) :
 * `POST /api/group-sessions/:id/register` réserve la place (anti-doublon et places restantes
 * vérifiés côté serveur) et crée le paiement FedaPay.
 */
export function useGroupSessionRegistration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const register = useMutation({
    mutationFn: async (params: RegisterSessionParams): Promise<RegisterSessionResponse> => {
      if (!auth.getUser()) {
        throw new Error('Vous devez être connecté pour vous inscrire');
      }

      const data = await api.post<RegisterSessionResponse>(`/group-sessions/${params.sessionId}/register`, {
        paymentMethod: params.paymentMethod,
        phoneNumber: params.phoneNumber,
      });

      if (!data.success) throw new Error(data.error || 'Erreur lors de l\'inscription');

      // ✅ Retourner les données au lieu de rediriger
      return {
        success: true,
        participantId: data.participantId,
        paymentId: data.paymentId,
        transactionId: data.transactionId,
        token: data.token,
        paymentUrl: data.paymentUrl,
        amount: data.amount,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['patient-group-sessions'] });

      // ✅ Plus de redirection automatique - géré par PaymentDialog
      console.log('✅ Inscription créée avec succès:', data);
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, "Impossible de s'inscrire à la séance"),
        variant: "destructive"
      });
    }
  });

  return {
    register: register.mutate,
    isRegistering: register.isPending,
  };
}
