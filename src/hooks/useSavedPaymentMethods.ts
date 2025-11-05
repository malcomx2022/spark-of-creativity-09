import { useCallback } from 'react';
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

export function useSavedPaymentMethods() {
  const { data: user } = useSupabaseUser();
  const queryClient = useQueryClient();

  const encryptPhone = useCallback(async (phone: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke<{ encrypted: string }>('secure-phone', {
      body: {
        action: 'encrypt',
        phone,
      },
    });

    if (error) {
      throw new Error(error.message || 'Impossible de chiffrer le numéro.');
    }

    if (!data?.encrypted) {
      throw new Error('Réponse de chiffrement invalide.');
    }

    return data.encrypted;
  }, []);

  const decryptPhone = useCallback(async (methodId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke<{ phone: string }>('secure-phone', {
      body: {
        action: 'decrypt',
        methodId,
      },
    });

    if (error) {
      throw new Error(error.message || 'Impossible de récupérer le numéro enregistré.');
    }

    if (!data?.phone) {
      throw new Error('Réponse de déchiffrement invalide.');
    }

    return data.phone;
  }, []);

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

      const encryptedPhone = await encryptPhone(phoneNumber);

      const { data, error } = await supabase
        .from('saved_payment_methods')
        .insert({
          user_id: user.id,
          provider,
          phone_number_masked: maskPhoneNumber(phoneNumber),
          phone_number_encrypted: encryptedPhone,
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

  const getDecryptedPhone = useCallback(async (methodId: string): Promise<string> => {
    return decryptPhone(methodId);
  }, [decryptPhone]);

  return {
    paymentMethods,
    isLoading,
    addPaymentMethod: addPaymentMethod.mutate,
    deletePaymentMethod: deletePaymentMethod.mutate,
    setDefaultPaymentMethod: setDefaultPaymentMethod.mutate,
    getDecryptedPhone,
  };
}
