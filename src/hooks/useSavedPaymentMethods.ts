import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseUser } from './useSupabaseUser';
import { toast } from './use-toast';

export interface SavedPaymentMethod {
  id: string;
  user_id: string;
  provider: 'mtn' | 'orange' | 'moov';
  phone_number_masked: string;
  phone_number_encrypted: string;
  is_default: boolean;
  consent_given_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Masque un numéro de téléphone (garde les 4 derniers chiffres)
 */
function maskPhoneNumber(phone: string): string {
  if (phone.length <= 4) return phone;
  return `****${phone.slice(-4)}`;
}

/**
 * Simple encryption pour le stockage (à améliorer avec une vraie solution crypto)
 */
function encryptPhone(phone: string): string {
  // TODO: Implémenter une vraie encryption avec une clé serveur
  // Pour l'instant, on utilise base64 (pas sécurisé pour la production!)
  return btoa(phone);
}

function decryptPhone(encrypted: string): string {
  try {
    return atob(encrypted);
  } catch {
    return '';
  }
}

export function useSavedPaymentMethods() {
  const { data: user } = useSupabaseUser();
  const queryClient = useQueryClient();

  const { data: paymentMethods = [], isLoading } = useQuery({
    queryKey: ['saved-payment-methods', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('saved_payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SavedPaymentMethod[];
    },
    enabled: !!user?.id,
  });

  const addPaymentMethod = useMutation({
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

      // Si on définit cette méthode comme par défaut, retirer le flag des autres
      if (setAsDefault) {
        await supabase
          .from('saved_payment_methods')
          .update({ is_default: false })
          .eq('user_id', user.id);
      }

      const { data, error } = await supabase
        .from('saved_payment_methods')
        .insert({
          user_id: user.id,
          provider,
          phone_number_masked: maskPhoneNumber(phoneNumber),
          phone_number_encrypted: encryptPhone(phoneNumber),
          is_default: setAsDefault,
          consent_given_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-payment-methods'] });
      toast({
        title: 'Méthode de paiement enregistrée',
        description: 'Votre numéro a été enregistré avec succès',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deletePaymentMethod = useMutation({
    mutationFn: async (methodId: string) => {
      const { error } = await supabase
        .from('saved_payment_methods')
        .delete()
        .eq('id', methodId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-payment-methods'] });
      toast({
        title: 'Méthode supprimée',
        description: 'La méthode de paiement a été supprimée',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setDefaultPaymentMethod = useMutation({
    mutationFn: async (methodId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Retirer le flag par défaut de toutes les méthodes
      await supabase
        .from('saved_payment_methods')
        .update({ is_default: false })
        .eq('user_id', user.id);

      // Définir la nouvelle méthode par défaut
      const { error } = await supabase
        .from('saved_payment_methods')
        .update({ is_default: true })
        .eq('id', methodId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-payment-methods'] });
      toast({
        title: 'Méthode par défaut mise à jour',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getDecryptedPhone = (method: SavedPaymentMethod): string => {
    return decryptPhone(method.phone_number_encrypted);
  };

  return {
    paymentMethods,
    isLoading,
    addPaymentMethod: addPaymentMethod.mutate,
    deletePaymentMethod: deletePaymentMethod.mutate,
    setDefaultPaymentMethod: setDefaultPaymentMethod.mutate,
    getDecryptedPhone,
  };
}
