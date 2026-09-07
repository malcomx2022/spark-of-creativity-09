import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuthUser } from './useAuthUser';
import { toast } from './use-toast';

/** Le numéro chiffré n'est jamais renvoyé par l'API : seul le numéro masqué est exposé. */
export interface SavedPaymentMethod {
  id: string;
  provider: 'mtn' | 'orange' | 'moov';
  phone_number_masked: string;
  is_default: boolean;
  consent_given_at: string;
  created_at: string;
}

export function useSavedPaymentMethods() {
  const { data: user } = useAuthUser();
  const queryClient = useQueryClient();

  const { data: paymentMethods = [], isLoading } = useQuery({
    queryKey: ['saved-payment-methods', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return api.get<SavedPaymentMethod[]>('/payment-methods');
    },
    enabled: !!user?.id,
  });

  const addPaymentMethod = useMutation({
    // Chiffrement, masquage, dédoublonnage et gestion du défaut sont faits côté API.
    mutationFn: async ({
      provider,
      phoneNumber,
      setAsDefault,
    }: {
      provider: 'mtn' | 'orange' | 'moov';
      phoneNumber: string;
      setAsDefault: boolean;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');
      return api.post<SavedPaymentMethod>('/payment-methods', { provider, phoneNumber, setAsDefault });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-payment-methods'] });
      toast({
        title: 'Méthode de paiement enregistrée',
        description: 'Votre numéro a été enregistré avec succès',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erreur',
        description: errorMessage(error, "Impossible d'enregistrer la méthode de paiement."),
        variant: 'destructive',
      });
    },
  });

  const deletePaymentMethod = useMutation({
    mutationFn: async (methodId: string) => {
      await api.delete(`/payment-methods/${methodId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-payment-methods'] });
      toast({
        title: 'Méthode supprimée',
        description: 'La méthode de paiement a été supprimée',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de supprimer la méthode de paiement.'),
        variant: 'destructive',
      });
    },
  });

  const setDefaultPaymentMethod = useMutation({
    mutationFn: async (methodId: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      await api.post(`/payment-methods/${methodId}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-payment-methods'] });
      toast({
        title: 'Méthode par défaut mise à jour',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de définir la méthode par défaut.'),
        variant: 'destructive',
      });
    },
  });

  /** Numéro en clair pour préremplir le paiement (propriétaire uniquement, ex secure-phone decrypt). */
  const getDecryptedPhone = useCallback(async (methodId: string): Promise<string> => {
    const data = await api.get<{ phone: string }>(`/payment-methods/${methodId}/phone`);
    if (!data?.phone) {
      throw new Error('Impossible de récupérer le numéro enregistré.');
    }
    return data.phone;
  }, []);

  return {
    paymentMethods,
    isLoading,
    addPaymentMethod: addPaymentMethod.mutateAsync,
    deletePaymentMethod: deletePaymentMethod.mutate,
    setDefaultPaymentMethod: setDefaultPaymentMethod.mutate,
    getDecryptedPhone,
  };
}
