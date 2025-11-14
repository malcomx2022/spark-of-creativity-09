import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunctionWithRetry } from '@/lib/edge-function-retry';
import { useToast } from '@/hooks/use-toast';
import { Session } from '@supabase/supabase-js';

const OTP_PHONE_KEY = 'otp_last_phone';

type OTPChannel = 'sms' | 'whatsapp' | 'call';

interface SendOTPParams {
  phoneNumber: string;
  channel?: OTPChannel;
}

interface VerifyOTPParams {
  phoneNumber: string;
  code: string;
}

interface SendOTPResponse {
  success: boolean;
  message?: string;
  status?: string;
  error?: string;
}

interface VerifyOTPResponse {
  success: boolean;
  verified?: boolean;
  is_new_user?: boolean;
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    expires_in?: number;
  };
  user?: {
    id: string;
    phone: string;
    email?: string;
  };
  error?: string;
}

/**
 * Hook personnalisé pour l'authentification via OTP
 * 
 * Fonctionnalités:
 * - Envoi d'OTP via SMS/WhatsApp/Appel
 * - Vérification d'OTP avec authentification automatique
 * - Gestion des états (loading, error, success)
 * - Stockage du numéro de téléphone en localStorage
 * - Toasts de feedback utilisateur
 * - Mise à jour automatique de la session Supabase
 */
export function useOTPAuth() {
  const { toast } = useToast();
  const [phoneStored, setPhoneStored] = useState<string | null>(
    () => localStorage.getItem(OTP_PHONE_KEY)
  );

  // Mutation pour envoyer l'OTP
  const sendOTPMutation = useMutation({
    mutationFn: async ({ phoneNumber, channel = 'sms' }: SendOTPParams) => {
      const { data, error } = await invokeEdgeFunctionWithRetry<SendOTPResponse>('send-otp', {
        body: {
          phoneNumber,
          channel
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to send OTP');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to send OTP');
      }

      return data;
    },
    onSuccess: (data, variables) => {
      // Stocker le numéro de téléphone dans localStorage
      localStorage.setItem(OTP_PHONE_KEY, variables.phoneNumber);
      setPhoneStored(variables.phoneNumber);

      const channelText = variables.channel === 'whatsapp' ? 'WhatsApp' : 
                         variables.channel === 'call' ? 'appel vocal' : 'SMS';

      toast({
        title: "Code envoyé",
        description: `Un code de vérification a été envoyé par ${channelText} au ${variables.phoneNumber}`,
      });
    },
    onError: (error: Error) => {
      console.error('Error sending OTP:', error);
      toast({
        title: "Erreur d'envoi",
        description: error.message || "Impossible d'envoyer le code. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  // Mutation pour vérifier l'OTP
  const verifyOTPMutation = useMutation({
    mutationFn: async ({ phoneNumber, code }: VerifyOTPParams) => {
      const { data, error } = await invokeEdgeFunctionWithRetry<VerifyOTPResponse>('verify-otp', {
        body: {
          phoneNumber,
          code
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to verify OTP');
      }

      if (!data?.success || !data?.verified) {
        throw new Error(data?.error || 'Code invalide ou expiré');
      }

      return data;
    },
    onSuccess: async (data) => {
      // Mettre à jour la session Supabase avec les tokens reçus
      if (data.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError) {
          console.error('Error setting session:', sessionError);
          throw new Error('Échec de la connexion');
        }
      }

      if (data.is_new_user) {
        toast({
          title: "Bienvenue !",
          description: "Votre compte a été créé avec succès.",
        });
      } else {
        toast({
          title: "Connexion réussie",
          description: "Vous êtes maintenant connecté.",
        });
      }
    },
    onError: (error: Error) => {
      console.error('Error verifying OTP:', error);
      toast({
        title: "Code invalide",
        description: error.message || "Le code est invalide ou a expiré. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  return {
    // Fonctions
    sendOTP: (phoneNumber: string, channel?: OTPChannel) => 
      sendOTPMutation.mutateAsync({ phoneNumber, channel }),
    verifyOTP: (phoneNumber: string, code: string) => 
      verifyOTPMutation.mutateAsync({ phoneNumber, code }),
    
    // États
    loading: sendOTPMutation.isPending || verifyOTPMutation.isPending,
    error: sendOTPMutation.error || verifyOTPMutation.error,
    sendingOTP: sendOTPMutation.isPending,
    verifyingOTP: verifyOTPMutation.isPending,
    phoneStored,
    
    // Méthodes utilitaires
    clearStoredPhone: () => {
      localStorage.removeItem(OTP_PHONE_KEY);
      setPhoneStored(null);
    },
  };
}
