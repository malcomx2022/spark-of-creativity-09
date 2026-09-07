import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { auth, errorMessage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

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

/**
 * Hook personnalisé pour l'authentification via OTP (ex Edge Functions send-otp / verify-otp,
 * désormais `POST /api/auth/otp/send` et `POST /api/auth/otp/verify`)
 *
 * Fonctionnalités:
 * - Envoi d'OTP via SMS/WhatsApp/Appel
 * - Vérification d'OTP avec ouverture de session automatique
 * - Gestion des états (loading, error, success)
 * - Stockage du numéro de téléphone en localStorage
 * - Toasts de feedback utilisateur
 */
export function useOTPAuth() {
  const { toast } = useToast();
  const [phoneStored, setPhoneStored] = useState<string | null>(
    () => localStorage.getItem(OTP_PHONE_KEY)
  );

  // Mutation pour envoyer l'OTP
  const sendOTPMutation = useMutation({
    mutationFn: async ({ phoneNumber, channel = 'sms' }: SendOTPParams) => {
      const data = await auth.sendOtp(phoneNumber, channel);
      if (!data?.success) {
        throw new Error(data?.message || "Impossible d'envoyer le code");
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
    onError: (error: unknown) => {
      console.error('Error sending OTP:', error);
      toast({
        title: "Erreur d'envoi",
        description: errorMessage(error, "Impossible d'envoyer le code. Veuillez réessayer."),
        variant: "destructive",
      });
    },
  });

  // Mutation pour vérifier l'OTP (la session est ouverte par l'API et conservée localement)
  const verifyOTPMutation = useMutation({
    mutationFn: async ({ phoneNumber, code }: VerifyOTPParams) => auth.verifyOtp(phoneNumber, code),
    onSuccess: (data) => {
      if (data.isNewUser) {
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
    onError: (error: unknown) => {
      console.error('Error verifying OTP:', error);
      toast({
        title: "Code invalide",
        description: errorMessage(error, "Le code est invalide ou a expiré. Veuillez réessayer."),
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
