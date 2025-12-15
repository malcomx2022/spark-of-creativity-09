import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, ShieldCheck, ExternalLink, ReceiptText, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunctionWithRetry } from '@/lib/edge-function-retry';
import { useSavedPaymentMethods } from '@/hooks/useSavedPaymentMethods';
import { MOBILE_MONEY_PROVIDERS, formatAmount } from '@/lib/payment-config';
import {
  clearPersistedPaymentState,
  getPersistedPaymentState,
  setPersistedPaymentState,
} from '@/lib/payment-storage';
import { normalizePhoneNumber } from '@/lib/phone-utils';
import { PaymentAttemptsHistory } from '@/components/PaymentAttemptsHistory';
import { withTimeout } from '@/lib/network-timeout';
import { 
  initFedaPayWidget, 
  isFedaPayLoaded, 
  CHECKOUT_COMPLETED, 
  DIALOG_DISMISSED,
  type FedaPayCheckoutWidget 
} from '@/lib/fedapay-widget';

type PaymentMethod = 'mtn' | 'moov';
type PaymentContext = 'appointment' | 'group_session';

interface PaymentResponse {
  success?: boolean;
  paymentUrl?: string;
  status?: string;
  paymentId?: string;
  transactionId?: string;
  message?: string;
  expiresAt?: string;
  error?: string;
}

const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes
function isPaymentResponse(payload: unknown): payload is PaymentResponse {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  
  // Check for error response
  if (candidate.error !== undefined && typeof candidate.error !== 'string') {
    return false;
  }

  // Check for success response fields
  if (candidate.paymentUrl !== undefined && typeof candidate.paymentUrl !== 'string') {
    return false;
  }

  if (candidate.status !== undefined && typeof candidate.status !== 'string') {
    return false;
  }

  if (candidate.paymentId !== undefined && typeof candidate.paymentId !== 'string') {
    return false;
  }

  return true;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId?: string;
  sessionId?: string;
  amount: number;
  context?: PaymentContext;
  sessionDetails?: {
    session_name: string;
    scheduled_date: string;
    start_time: string;
    current_participants?: number;
    max_participants?: number;
  };
  onSuccess?: () => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function PaymentDialog({ 
  open, 
  onOpenChange, 
  appointmentId, 
  sessionId,
  amount, 
  context = 'appointment',
  sessionDetails,
  onSuccess, 
  onComplete, 
  onError 
}: PaymentDialogProps) {
  const contextId = context === 'appointment' ? appointmentId : sessionId;
  
  if (!contextId) {
    throw new Error(`${context === 'appointment' ? 'appointmentId' : 'sessionId'} is required`);
  }
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [saveMethod, setSaveMethod] = useState(false);
  const [useSavedMethod, setUseSavedMethod] = useState(false);
  const [selectedSavedMethod, setSelectedSavedMethod] = useState<string>('');
  const [autoPrefilled, setAutoPrefilled] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(0);
  const [existingPaymentChecked, setExistingPaymentChecked] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [fedapayConfig, setFedapayConfig] = useState<{ publicKey: string; environment: string } | null>(null);
  const hasRehydratedRef = useRef(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const widgetRef = useRef<any>(null);
  
  const { paymentMethods, addPaymentMethod, getDecryptedPhone } = useSavedPaymentMethods();

  // ✅ CORRECTION CRITIQUE #1: Charger la configuration FedaPay
  useEffect(() => {
    const loadFedaPayConfig = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-fedapay-config');
        if (error) throw error;
        setFedapayConfig(data);
        
        // En mode sandbox, pré-remplir avec un numéro de test MTN
        if (data?.environment === 'sandbox' && !phoneNumber) {
          setPhoneNumber('+22966000001'); // Numéro de test MTN Benin
        }
      } catch (error) {
        console.error('Failed to load FedaPay config:', error);
        toast({
          title: 'Erreur de configuration',
          description: 'Impossible de charger la configuration de paiement',
          variant: 'destructive',
        });
      }
    };
    if (open) {
      loadFedaPayConfig();
    }
  }, [open]);

  // Cleanup widget on unmount
  useEffect(() => {
    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.close();
        } catch (error) {
          console.error('Error closing FedaPay widget:', error);
        }
      }
    };
  }, []);

  // Charger le profil utilisateur pour pré-remplir les informations
  useEffect(() => {
    const loadUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await withTimeout(
        supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single()
      );

      if (profile) {
        if (profile.full_name && !payerName) {
          setPayerName(profile.full_name);
        }
        if (profile.phone && !phoneNumber) {
          setPhoneNumber(profile.phone);
        }
      }

      // Essayer de récupérer l'email depuis auth
      if (user.email && !payerEmail) {
        setPayerEmail(user.email);
      }
    };

    if (open) {
      loadUserProfile();
    }
  }, [open]);

  // ✅ Vérifier immédiatement à l'ouverture s'il existe un paiement en cours
  useEffect(() => {
    if (!open || existingPaymentChecked) return;

    const checkExistingPayment = async () => {
      console.log(`🔍 Vérification d'un paiement existant pour ${context}:`, contextId);
      
      // Pour les rendez-vous, on vérifie via appointment_id
      // Pour les séances de groupe, on vérifie via group_session_participants
      let existingPayment = null;
      
      if (context === 'appointment') {
        const { data } = await withTimeout(
          supabase
            .from('payments')
            .select('id, fedapay_payment_url, fedapay_transaction_id, status, created_at')
            .eq('appointment_id', contextId)
            .in('status', ['initiated', 'pending'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        );
        existingPayment = data;
      } else {
        // Pour les séances de groupe, vérifier via participants
        const { data: participant } = await withTimeout(
          supabase
            .from('group_session_participants')
            .select('id, payment_status')
            .eq('session_id', contextId)
            .eq('patient_id', (await supabase.auth.getUser()).data.user?.id || '')
            .eq('payment_status', 'pending')
            .maybeSingle()
        );
        
        if (participant) {
          // Chercher le paiement associé via les events
          console.log('Participant en attente trouvé, séance déjà réservée');
          existingPayment = null; // Laisser continuer le flow normal
        }
      }
      
      const { data: existingPaymentData } = existingPayment ? { data: existingPayment } : { data: null };

      if (existingPayment) {
        console.log('✅ Paiement existant trouvé:', existingPayment.id, 'Status:', existingPayment.status);

        // Vérifier si le paiement a plus de 10 minutes (expiré)
        const paymentAge = Date.now() - new Date(existingPayment.created_at).getTime();
        const tenMinutes = 10 * 60 * 1000;

        if (paymentAge > tenMinutes) {
          console.log('⏰ Paiement expiré, annulation via cancel-pending-payment...');

          // ✅ CORRECTION P1 #4: Nettoyer le paiement ET remettre le RDV en état cohérent
          try {
            const { error: cancelError } = await supabase.functions.invoke('cancel-pending-payment', {
              body: { appointmentId }
            });

            if (cancelError) {
              console.error('Error canceling expired payment:', cancelError);
              // Fallback: suppression simple + remise à jour du RDV
              await supabase.from('payments').delete().eq('id', existingPayment.id);
              
              // ✅ CORRECTION P1 #4: Remettre le RDV en statut cohérent
              if (context === 'appointment' && appointmentId) {
                await supabase
                  .from('appointments')
                  .update({ 
                    status: 'awaiting_practitioner',
                    payment_expires_at: null 
                  })
                  .eq('id', appointmentId)
                  .eq('status', 'pending_payment'); // Seulement si en pending_payment
              }
            }

            toast({
              title: 'Paiement expiré',
              description: 'Le paiement précédent a expiré et a été annulé. Vous pouvez créer un nouveau paiement.',
            });
          } catch (error) {
            console.error('Error in cancellation:', error);
            toast({
              title: 'Paiement expiré',
              description: 'Le paiement précédent a expiré. Veuillez réessayer.',
              variant: 'destructive',
            });
          }

          setExistingPaymentChecked(true);
          return;
        }

        // Si le paiement a une URL et un transactionId, utiliser le widget FedaPay
        if (existingPayment.fedapay_payment_url && existingPayment.fedapay_transaction_id) {
          setPaymentId(existingPayment.id);
          setPaymentUrl(existingPayment.fedapay_payment_url);
          setTransactionId(existingPayment.fedapay_transaction_id);
          setPaymentStatus('pending');
          setPollCount(0);

          const remainingMinutes = Math.ceil((tenMinutes - paymentAge) / 60000);

          // ✅ CORRECTION: Utiliser le widget FedaPay au lieu d'ouvrir l'URL directement
          // Attendre que la configuration FedaPay soit chargée
          const waitForConfig = async () => {
            let attempts = 0;
            while (!fedapayConfig && attempts < 10) {
              await new Promise(resolve => setTimeout(resolve, 300));
              attempts++;
            }
            return fedapayConfig;
          };

          const config = await waitForConfig();
          
          if (config && isFedaPayLoaded()) {
            const txId = parseInt(existingPayment.fedapay_transaction_id);
            
            console.log('Opening existing payment with FedaPay widget:', txId);
            
            const widget = initFedaPayWidget({
              public_key: config.publicKey,
              environment: config.environment as 'sandbox' | 'live',
              transaction: {
                id: txId,
                amount: amount,
                description: context === 'group_session' 
                  ? `Paiement séance de groupe`
                  : `Paiement rendez-vous médical`,
              },
              currency: {
                iso: 'XOF',
              },
              locale: 'fr',
              onComplete: async (payload) => {
                console.log('Existing payment completed:', payload);
                
                if (payload.reason === CHECKOUT_COMPLETED) {
                  setPaymentStatus('success');
                  setIsProcessing(false);
                  
                  toast({
                    title: 'Paiement réussi !',
                    description: 'Votre rendez-vous a été confirmé.',
                  });
                  
                  clearPersistedPaymentState();
                  
                  if (onSuccess) onSuccess();
                  if (onComplete) onComplete();
                  
                  setTimeout(() => {
                    resetPaymentState();
                    onOpenChange(false);
                  }, 2000);
                } else if (payload.reason === DIALOG_DISMISSED) {
                  // L'utilisateur a fermé le widget - le paiement reste "pending" et peut être repris
                  setPaymentStatus('pending');
                  setIsProcessing(false);
                  
                  toast({
                    title: 'Paiement en attente',
                    description: 'Vous pouvez reprendre le paiement à tout moment depuis votre tableau de bord.',
                  });
                }
              },
            });

            if (widget) {
              widgetRef.current = widget;
              widget.open();
              
              toast({
                title: 'Paiement en cours',
                description: `Un paiement est déjà en cours (expire dans ${remainingMinutes} min). Complétez-le dans la fenêtre de paiement.`,
              });
            } else {
              // Fallback: ouvrir l'URL si le widget échoue
              console.warn('Widget init failed, falling back to URL');
              window.open(existingPayment.fedapay_payment_url, '_blank', 'noopener,noreferrer');
              
              toast({
                title: 'Paiement en cours',
                description: `Complétez le paiement dans la nouvelle fenêtre (expire dans ${remainingMinutes} min).`,
              });
            }
          } else {
            // Fallback si FedaPay n'est pas chargé
            console.warn('FedaPay not loaded, falling back to URL');
            window.open(existingPayment.fedapay_payment_url, '_blank', 'noopener,noreferrer');
            
            toast({
              title: 'Paiement en cours',
              description: `Complétez le paiement dans la nouvelle fenêtre (expire dans ${remainingMinutes} min).`,
            });
          }
        } else {
          // Paiement sans URL ou transactionId (probablement échoué), l'annuler proprement
          console.log('⚠️ Paiement incomplet détecté, annulation...');

          try {
            const { error: cancelError } = await supabase.functions.invoke('cancel-pending-payment', {
              body: { appointmentId }
            });

            if (cancelError) {
              console.error('Error canceling incomplete payment:', cancelError);
              // Fallback: suppression simple
              await supabase.from('payments').delete().eq('id', existingPayment.id);
            }

            toast({
              title: 'Paiement incomplet',
              description: 'Un paiement incomplet a été nettoyé. Vous pouvez créer un nouveau paiement.',
            });
          } catch (error) {
            console.error('Error in cancellation:', error);
            toast({
              title: 'Erreur',
              description: 'Impossible de nettoyer le paiement incomplet. Veuillez contacter le support.',
              variant: 'destructive',
            });
          }
        }
      } else {
        console.log('ℹ️ Aucun paiement en cours trouvé, création possible');
      }

      setExistingPaymentChecked(true);
    };

    checkExistingPayment();
  }, [open, appointmentId, existingPaymentChecked]);

  // Réinitialiser l'état lors de la fermeture
  useEffect(() => {
    if (!open) {
      setExistingPaymentChecked(false);
    }
  }, [open]);

  // Enregistrer une tentative de paiement
  const recordPaymentAttempt = async (
    status: 'pending' | 'success' | 'failed' | 'timeout',
    errorMessage?: string,
    errorType?: string,
    errorDetails?: Record<string, any>
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await supabase.from('payment_attempts').insert({
        appointment_id: context === 'appointment' ? contextId : null,
        user_id: session.user.id,
        attempt_number: attemptNumber + 1,
        status,
        error_type: errorType || null,
        error_message: errorMessage || null,
        error_details: errorDetails || null,
        payment_method: paymentMethod,
        amount,
        payment_id: paymentId || null,
      });

      setAttemptNumber(prev => prev + 1);
    } catch (error) {
      console.error('Error recording payment attempt:', error);
    }
  };

  // Pré-sélectionner la méthode par défaut lorsqu'aucun numéro n'est fourni
  useEffect(() => {
    if (autoPrefilled) return;
    if (paymentMethods.length === 0) return;
    if (selectedSavedMethod) return;
    if (phoneNumber) return;

    const defaultMethod = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0];

    if (defaultMethod) {
      setUseSavedMethod(true);
      setSelectedSavedMethod(defaultMethod.id);
      setAutoPrefilled(true);
    }
  }, [autoPrefilled, paymentMethods, selectedSavedMethod, phoneNumber]);

  // Charger et déchiffrer le numéro lorsque l'utilisateur choisit une méthode sauvegardée
  useEffect(() => {
    if (!useSavedMethod || !selectedSavedMethod) {
      return;
    }

    const method = paymentMethods.find((m) => m.id === selectedSavedMethod);

    if (!method) {
      return;
    }

    // Valider que le provider est supporté (mtn ou moov)
    const validProvider = method.provider === 'mtn' || method.provider === 'moov' ? method.provider : 'mtn';
    setPaymentMethod(validProvider);

    let isActive = true;

    (async () => {
      try {
        const decrypted = await getDecryptedPhone(method.id);
        if (isActive) {
          setPhoneNumber(decrypted);
        }
      } catch (error) {
        console.error('Erreur lors du déchiffrement du numéro enregistré:', error);
        toast({
          title: 'Impossible de récupérer le numéro',
          description: "Veuillez saisir manuellement votre numéro pour continuer.",
          variant: 'destructive',
        });
        if (isActive) {
          setUseSavedMethod(false);
          setSelectedSavedMethod('');
          setPhoneNumber('');
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [useSavedMethod, selectedSavedMethod, paymentMethods, getDecryptedPhone]);

  useEffect(() => {
    if (!useSavedMethod) {
      setSelectedSavedMethod('');
    }
  }, [useSavedMethod]);

  const handlePayment = async () => {
    // ✅ CORRECTION BUG #1: Éviter les double-clics avec un flag
    if (isCreatingPayment) {
      console.log('⚠️ Création de paiement déjà en cours, ignorer');
      return;
    }
    
    setIsCreatingPayment(true);
    
    // Si une méthode sauvegardée est sélectionnée, l'utiliser
    let resolvedPhoneNumber = phoneNumber;

    if (useSavedMethod && selectedSavedMethod) {
      const method = paymentMethods.find((m) => m.id === selectedSavedMethod);
      if (method) {
        try {
          const decrypted = await getDecryptedPhone(method.id);
          resolvedPhoneNumber = decrypted;
          // Valider que le provider est supporté (mtn ou moov)
          const validProvider = method.provider === 'mtn' || method.provider === 'moov' ? method.provider : 'mtn';
          setPaymentMethod(validProvider);
          setPhoneNumber(decrypted);
        } catch (error) {
          console.error('Erreur lors du déchiffrement de la méthode sélectionnée:', error);
          toast({
            title: 'Méthode indisponible',
            description: 'Impossible de récupérer votre numéro. Veuillez le saisir manuellement.',
            variant: 'destructive',
          });
          setIsProcessing(false);
          setPaymentStatus('idle');
          setUseSavedMethod(false);
          setSelectedSavedMethod('');
          setPhoneNumber('');
          return;
        }
      }
    }

    const sanitizedPhoneNumber = normalizePhoneNumber(resolvedPhoneNumber);

    // Helper: Format phone number for FedaPay (remove +229 prefix for Benin)
    const formatPhoneForFedaPay = (phone: string | null): string => {
      if (!phone) return '';
      // Pour le Bénin, retirer le préfixe +229 pour sandbox FedaPay
      return phone.replace(/^\+229/, '');
    };

    if (!sanitizedPhoneNumber) {
      setIsCreatingPayment(false);
      toast({
        title: 'Erreur',
        description: 'Numéro de téléphone invalide. Format attendu: +229 XXXXXXXX',
        variant: 'destructive',
      });
      return;
    }

    // Valider le nom du payeur
    if (!payerName.trim()) {
      setIsCreatingPayment(false);
      toast({
        title: 'Erreur',
        description: 'Veuillez saisir le nom du payeur',
        variant: 'destructive',
      });
      return;
    }

    // Valider l'email si fourni
    if (payerEmail && !payerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setIsCreatingPayment(false);
      toast({
        title: 'Erreur',
        description: 'Adresse email invalide',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setPaymentStatus('pending');
    await recordPaymentAttempt('pending');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Vous devez être connecté pour effectuer un paiement');
      }

      console.log('Initiating payment:', { contextId, context, amount, paymentMethod });

      // ✅ Appeler l'edge function appropriée selon le contexte
      let edgeFunctionName: string;
      let edgeFunctionBody: any;

      if (context === 'appointment') {
        edgeFunctionName = 'create-payment';
        edgeFunctionBody = {
          appointmentId: contextId,
          amount,
          paymentMethod,
          phoneNumber: sanitizedPhoneNumber,
          payerName: payerName.trim(),
          payerEmail: payerEmail.trim() || undefined,
        };
      } else {
        edgeFunctionName = 'register-group-session';
        edgeFunctionBody = {
          sessionId: contextId,
          patientId: session.user.id,
          amount,
          paymentMethod,
          phoneNumber: sanitizedPhoneNumber,
        };
      }

      // Appel avec retry et notification à chaque tentative
      const { data: result, error } = await invokeEdgeFunctionWithRetry(
        edgeFunctionName,
        { body: edgeFunctionBody },
        3, // 3 tentatives max
        (attempt, retryError) => {
          // Toast d'information lors des retries
          toast({
            title: `Tentative ${attempt + 1}...`,
            description: 'Nouvelle tentative de connexion au service de paiement.',
            duration: 2000,
          });
          
          // Enregistrer la tentative échouée
          recordPaymentAttempt('failed', retryError.message, 'network_error', {
            attempt: attempt + 1,
            error: retryError.message,
          });
        }
      );

      if (error) {
        console.error('Supabase function error:', error);
        console.log('Full error object:', JSON.stringify(error, null, 2));
        await recordPaymentAttempt('failed', error.message, 'api_error', { error: error.message });
        setIsCreatingPayment(false);
        
        // Parse l'erreur pour récupérer les détails du paiement en cours (409)
        let errorDetails: any = null;
        const errorMessage = error.message || String(error);
        
        try {
          // Essayer plusieurs patterns de parsing
          // Pattern 1: JSON direct dans le message
          const jsonMatch = errorMessage.match(/\{[^}]*"error"[^}]*\}/);
          if (jsonMatch) {
            errorDetails = JSON.parse(jsonMatch[0]);
            console.log('Parsed error details (pattern 1):', errorDetails);
          }
          
          // Pattern 2: Après "Error, "
          if (!errorDetails && errorMessage.includes('Error, {')) {
            const afterError = errorMessage.substring(errorMessage.indexOf('Error, {') + 7);
            const jsonEnd = afterError.indexOf('}') + 1;
            if (jsonEnd > 0) {
              errorDetails = JSON.parse(afterError.substring(0, jsonEnd));
              console.log('Parsed error details (pattern 2):', errorDetails);
            }
          }
          
          // Pattern 3: Parse tout le message comme JSON
          if (!errorDetails) {
            try {
              errorDetails = JSON.parse(errorMessage);
              console.log('Parsed error details (pattern 3):', errorDetails);
            } catch (e) {
              // Pas JSON valide
            }
          }
        } catch (parseError) {
          console.error('Could not parse error details:', parseError);
        }
        
        // Si c'est une erreur 409 (paiement en cours), afficher un bouton d'annulation
        const is409Error = errorDetails && (errorDetails.paymentId || errorDetails.existingPaymentStatus);
        
        if (is409Error) {
          console.log('409 error detected, showing cancel button');
          setIsProcessing(false);
          setPaymentStatus('error');
          
          toast({
            title: 'Paiement en cours',
            description: errorDetails.error || 'Un paiement est déjà en attente',
            variant: 'destructive',
            duration: 10000,
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { error: cancelError } = await supabase.functions.invoke('cancel-pending-payment', {
                      body: { appointmentId }
                    });
                    
                    if (cancelError) throw cancelError;
                    
                    toast({
                      title: 'Paiement annulé',
                      description: 'Vous pouvez maintenant créer un nouveau paiement.',
                    });
                    
                    // Réinitialiser le formulaire
                    resetPaymentState();
                    setExistingPaymentChecked(false);
                  } catch (e) {
                    console.error('Cancel error:', e);
                    toast({
                      title: 'Erreur',
                      description: 'Impossible d\'annuler le paiement. Veuillez réessayer.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Annuler et réessayer
              </Button>
            ),
          });
          return;
        }
        
        throw error;
      }

      console.log('Payment response received:', result);

      if (isPaymentResponse(result)) {
        // Vérifier si une erreur est retournée
        if (result.error) {
          setIsCreatingPayment(false);
          throw new Error(result.error);
        }

        // Vérifier que nous avons une URL de paiement
        if (!result.paymentUrl) {
          setIsCreatingPayment(false);
          throw new Error('URL de paiement non reçue du serveur');
        }

        setPaymentUrl(result.paymentUrl);
        setPaymentId(result.paymentId || null);
        setTransactionId(result.transactionId || null);
        setExpiresAt(result.expiresAt || null);
        setPaymentStatus('pending');
        setPollCount(0);
        setIsCreatingPayment(false);

        // Sauvegarder la méthode si demandé et consentement donné
        if (saveMethod && !useSavedMethod) {
          try {
            await addPaymentMethod({
              provider: paymentMethod,
              phoneNumber: sanitizedPhoneNumber,
              setAsDefault: paymentMethods.length === 0,
            });
          } catch (saveError) {
            console.error('Error saving payment method:', saveError);
            // Ne pas bloquer le paiement si la sauvegarde échoue
          }
        }

        // ✅ CORRECTION CRITIQUE #1: Utiliser le widget FedaPay au lieu d'ouvrir une simple URL
        if (!isFedaPayLoaded()) {
          toast({
            title: 'Erreur',
            description: 'Le système de paiement n\'est pas encore chargé. Veuillez réessayer.',
            variant: 'destructive',
          });
          setIsProcessing(false);
          setPaymentStatus('idle');
          setIsCreatingPayment(false);
          return;
        }

        if (!fedapayConfig) {
          toast({
            title: 'Erreur',
            description: 'Configuration de paiement non disponible. Veuillez rafraîchir la page.',
            variant: 'destructive',
          });
          setIsProcessing(false);
          setPaymentStatus('idle');
          setIsCreatingPayment(false);
          return;
        }

        if (!result.transactionId) {
          toast({
            title: 'Erreur',
            description: 'ID de transaction non reçu du serveur',
            variant: 'destructive',
          });
          setIsProcessing(false);
          setPaymentStatus('idle');
          setIsCreatingPayment(false);
          return;
        }

        const txId = parseInt(String(result.transactionId));

        console.log('Initializing FedaPay widget with:', {
          transactionId: txId,
          environment: fedapayConfig.environment,
          amount
        });

        // Initialiser le widget FedaPay
        const widget = initFedaPayWidget({
          public_key: fedapayConfig.publicKey,
          environment: fedapayConfig.environment as 'sandbox' | 'live',
          transaction: {
            id: txId,
            amount: amount,
            description: context === 'group_session' 
              ? `Paiement séance de groupe`
              : `Paiement rendez-vous médical #${contextId}`,
          },
          customer: {
            phone_number: {
              number: formatPhoneForFedaPay(sanitizedPhoneNumber),
              country: 'bj', // ✅ CORRECTION: Minuscules requis par FedaPay
            },
          },
          currency: {
            iso: 'XOF',
          },
          locale: 'fr',
          onComplete: async (payload) => {
            console.log('Payment completed:', payload);

              if (payload.reason === CHECKOUT_COMPLETED) {
              // Paiement réussi
              setPaymentStatus('success');
              setIsProcessing(false);
              await recordPaymentAttempt('success');

              // Sauvegarder la méthode si demandé
              if (saveMethod && !useSavedMethod) {
                try {
                  await addPaymentMethod({
                    provider: paymentMethod,
                    phoneNumber: sanitizedPhoneNumber,
                    setAsDefault: paymentMethods.length === 0,
                  });
                } catch (saveError) {
                  console.error('Error saving payment method:', saveError);
                }
              }

              toast({
                title: 'Paiement réussi !',
                description: 'Votre rendez-vous a été confirmé.',
              });

              clearPersistedPaymentState();

              if (onSuccess) {
                onSuccess();
              }

              if (onComplete) {
                onComplete();
              }

              setTimeout(() => {
                resetPaymentState();
                onOpenChange(false);
              }, 2000);
            } else if (payload.reason === DIALOG_DISMISSED) {
              // Utilisateur a fermé le widget - le paiement reste "pending" et peut être repris
              // NE PAS marquer comme échoué car le paiement peut être complété plus tard
              setPaymentStatus('pending');
              setIsProcessing(false);
              // NE PAS enregistrer comme échec - juste informer l'utilisateur

              toast({
                title: 'Paiement en attente',
                description: 'Le paiement reste disponible. Vous pouvez le reprendre depuis votre tableau de bord.',
              });

              // Ne pas appeler onError car ce n'est pas une erreur
            }
          },
        });

        if (!widget) {
          throw new Error('Impossible d\'initialiser le widget de paiement');
        }

        widgetRef.current = widget;

        // Ouvrir le widget de paiement avec gestion d'erreur
        try {
          widget.open();
          
          toast({
            title: 'Fenêtre de paiement ouverte',
            description: 'Complétez le paiement dans la fenêtre popup. Si elle ne s\'affiche pas, veuillez autoriser les popups pour ce site.',
            duration: 5000,
          });
        } catch (openError) {
          console.error('Error opening FedaPay popup:', openError);
          throw new Error('Impossible d\'ouvrir la fenêtre de paiement. Veuillez autoriser les popups pour ce site et réessayer.');
        }
      } else {
        setIsCreatingPayment(false);
        throw new Error('Format de réponse invalide du serveur');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
      setIsProcessing(false);
      setIsCreatingPayment(false);
      
      const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement';
      
      // Ne pas afficher de toast ici si on a déjà géré l'erreur 409 au-dessus
      // Vérifier si c'est une erreur de paiement en cours déjà gérée
      const isHandled409 = errorMessage.includes('paiement est déjà en cours') || errorMessage.includes('paymentId');
      
      if (!isHandled409) {
        // Enregistrer l'échec définitif
        await recordPaymentAttempt('failed', errorMessage, 'payment_error', {
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
        
        toast({
          title: 'Erreur de paiement',
          description: errorMessage,
          variant: 'destructive',
          duration: 5000,
        });

        if (onError) {
          onError(error instanceof Error ? error : new Error(errorMessage));
        }
      }
    }
  };

  const resetPaymentState = useCallback(() => {
    setIsProcessing(false);
    setPaymentStatus('idle');
    setPaymentUrl(null);
    setPaymentId(null);
    setTransactionId(null);
    setExpiresAt(null);
    setPollCount(0);
    setPhoneNumber('');
    setPayerName('');
    setPayerEmail('');
    setSaveMethod(false);
    setUseSavedMethod(false);
    setSelectedSavedMethod('');
    setAutoPrefilled(false);
    setAttemptNumber(0);
    hasRehydratedRef.current = false;
    clearPersistedPaymentState();
  }, []);

  const closeDialog = useCallback(() => {
    resetPaymentState();
    onOpenChange(false);
  }, [onOpenChange, resetPaymentState]);

  // ✅ CORRECTION BUG #4: Poll payment status avec cleanup et timeout appropriés
  useEffect(() => {
    if (!paymentId || paymentStatus !== 'pending') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollStartTimeRef.current = Date.now();
    let isMounted = true;

    const checkPaymentStatus = async () => {
      if (!isMounted) return;

      try {
        // ✅ Vérifier le timeout
        const elapsed = Date.now() - pollStartTimeRef.current;
        if (elapsed > MAX_POLL_TIME) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          
          if (isMounted) {
            setPaymentStatus('error');
            setIsProcessing(false);
            await recordPaymentAttempt('timeout', 'Délai de paiement dépassé');
            
            toast({
              variant: "destructive",
              title: "Délai dépassé",
              description: "Le paiement prend trop de temps. Vérifiez votre historique de paiements.",
            });
          }
          return;
        }

        // Query payment status from database
        const { data: payment, error } = await supabase
          .from('payments')
          .select('status')
          .eq('id', paymentId)
          .single();

        if (error) {
          console.error('Error polling payment:', error);
          return;
        }

        if (!isMounted) return;

        setPollCount(prev => prev + 1);

        if (payment.status === 'paid') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          
          setPaymentStatus('success');
          setIsProcessing(false);
          await recordPaymentAttempt('success');
          
          toast({
            title: "Paiement réussi !",
            description: "Votre rendez-vous a été confirmé.",
          });
          
          clearPersistedPaymentState();
          
          if (onSuccess) {
            onSuccess();
          }
          
          if (onComplete) {
            onComplete();
          }
          
          setTimeout(() => {
            if (isMounted) {
              closeDialog();
            }
          }, 2000);
        } else if (['failed', 'canceled'].includes(payment.status)) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          
          setPaymentStatus('error');
          setIsProcessing(false);
          await recordPaymentAttempt('failed', `Paiement ${payment.status}`, 'payment_status_error', {
            status: payment.status,
          });
          
          toast({
            variant: "destructive",
            title: "Paiement échoué",
            description: "Le paiement n'a pas pu être complété. Veuillez réessayer.",
          });
        }
      } catch (error) {
        console.error('Error in payment polling:', error);
      }
    };

    pollIntervalRef.current = setInterval(checkPaymentStatus, POLL_INTERVAL);

    return () => {
      isMounted = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [paymentId, paymentStatus, onSuccess, closeDialog]);

  const handleDialogOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      resetPaymentState();
    }
    onOpenChange(isOpen);
  }, [onOpenChange, resetPaymentState]);

  // Persist payment state to allow hydration after reload
  useEffect(() => {
    if (!open) {
      return;
    }

    if (!paymentId || paymentStatus !== 'pending') {
      clearPersistedPaymentState();
      return;
    }

    setPersistedPaymentState({
      appointmentId,
      amount,
      paymentMethod,
      phoneNumber,
      paymentStatus,
      paymentUrl,
      paymentId,
      transactionId,
      expiresAt,
      useSavedMethod,
      selectedSavedMethod,
      payerName,
      payerEmail,
      lastUpdated: Date.now(),
    });
  }, [
    open,
    appointmentId,
    amount,
    paymentMethod,
    phoneNumber,
    paymentStatus,
    paymentUrl,
    paymentId,
    transactionId,
    expiresAt,
    useSavedMethod,
    selectedSavedMethod,
    payerName,
    payerEmail,
  ]);

  // Rehydrate state from localStorage when dialog opens
  useEffect(() => {
    if (!open || hasRehydratedRef.current) {
      return;
    }

    const persisted = getPersistedPaymentState();
    if (!persisted) {
      hasRehydratedRef.current = true;
      return;
    }

    if (persisted.appointmentId !== appointmentId) {
      hasRehydratedRef.current = true;
      return;
    }

    console.log('🔄 Réhydratation du paiement:', persisted);
    
    // Valider que la méthode de paiement est supportée (mtn ou moov)
    const validMethod = persisted.paymentMethod === 'mtn' || persisted.paymentMethod === 'moov' ? persisted.paymentMethod : 'mtn';
    setPaymentMethod(validMethod);
    setPhoneNumber(persisted.phoneNumber);
    setPaymentStatus(persisted.paymentStatus);
    setPaymentUrl(persisted.paymentUrl);
    setPaymentId(persisted.paymentId);
    setTransactionId(persisted.transactionId);
    setExpiresAt(persisted.expiresAt);
    setUseSavedMethod(persisted.useSavedMethod);
    setSelectedSavedMethod(persisted.selectedSavedMethod);
    
    // Restaurer les infos du payeur si disponibles
    if (persisted.payerName) {
      setPayerName(persisted.payerName);
    }
    if (persisted.payerEmail) {
      setPayerEmail(persisted.payerEmail);
    }
    
    setPollCount(0);
    setIsProcessing(persisted.paymentStatus === 'pending');
    hasRehydratedRef.current = true;

    // Informer l'utilisateur de la réhydratation
    if (persisted.paymentStatus === 'pending') {
      toast({
        title: 'Reprise du paiement',
        description: 'Votre paiement en cours a été restauré. Vous pouvez compléter la transaction.',
        duration: 6000,
      });
    }
  }, [open, appointmentId]);

  const handleReopenPaymentWindow = () => {
    if (!paymentUrl) return;

    const features = 'width=600,height=700,scrollbars=yes,location=yes';
    window.open(paymentUrl, '_blank', features);
  };

  const formatExpiry = (value: string | null) => {
    if (!value) return null;

    try {
      return new Date(value).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.error('Unable to format expiry date', error);
      return null;
    }
  };

  const selectedProvider = MOBILE_MONEY_PROVIDERS[paymentMethod];

  const renderPaymentStatus = () => {
    switch (paymentStatus) {
      case 'pending':
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-semibold">Redirection vers FedaPay</p>
              <p className="text-sm text-muted-foreground text-center">
                Une requête USSD est envoyée sur votre téléphone : saisissez votre code PIN Mobile Money pour valider la transaction.
              </p>
              <p className="text-xs text-muted-foreground">
                Vérification {pollCount} / {Math.floor(MAX_POLL_TIME / POLL_INTERVAL)}
              </p>
              {formatExpiry(expiresAt) && (
                <p className="text-xs text-muted-foreground">
                  Expiration du lien : {formatExpiry(expiresAt)}
                </p>
              )}
              {transactionId && (
                <p className="text-xs font-mono text-muted-foreground">
                  Transaction FedaPay : {transactionId}
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4" />
                Suivi du paiement
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Confirmez le paiement dans l&apos;onglet FedaPay qui vient de s&apos;ouvrir.</li>
                <li>Sur votre mobile, entrez le code PIN sur la requête USSD reçue ou utilisez le code OTP envoyé par SMS.</li>
                <li>Revenez ici : nous mettons à jour le statut automatiquement.</li>
              </ol>
              <div className="flex flex-col gap-2 sm:flex-row">
                {paymentUrl && (
                  <Button className="flex-1" variant="secondary" onClick={handleReopenPaymentWindow}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Ré-ouvrir FedaPay
                  </Button>
                )}
                <Button className="flex-1" variant="outline" onClick={closeDialog}>
                  Annuler
                </Button>
              </div>
            </div>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-lg font-semibold">Paiement initié avec succès !</p>
            <p className="text-sm text-muted-foreground text-center">
              Suivez les instructions sur votre téléphone ou sur FedaPay pour finaliser le paiement.
            </p>
          </div>
        );
      case 'error':
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-lg font-semibold">Erreur de paiement</p>
              <p className="text-sm text-muted-foreground text-center">
                Une erreur s'est produite. Veuillez réessayer.
              </p>
            </div>
            
            {/* Afficher l'historique des tentatives en cas d'erreur */}
            {context === 'appointment' && (
              <PaymentAttemptsHistory appointmentId={contextId} />
            )}
            
            <Button onClick={() => setPaymentStatus('idle')} variant="outline" className="w-full">
              Réessayer
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {context === 'appointment' 
              ? 'Payer le rendez-vous' 
              : `Inscription - ${sessionDetails?.session_name || 'Séance de groupe'}`
            }
          </DialogTitle>
          <DialogDescription>
            {context === 'appointment' 
              ? `Montant à payer: ${formatAmount(amount)}`
              : `Montant de l'inscription: ${formatAmount(amount)}`
            }
            {sessionDetails && (
              <div className="text-xs mt-1">
                {new Date(sessionDetails.scheduled_date).toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'long' 
                })} à {sessionDetails.start_time}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Alerte pour mode sandbox avec numéros de test */}
        {fedapayConfig?.environment === 'sandbox' && paymentStatus === 'idle' && (
          <Alert className="border-primary/50 bg-primary/5">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              <p className="font-semibold mb-2">Mode Test - Utilisez ces numéros :</p>
              <ul className="space-y-1 text-xs">
                <li>✅ <strong>MTN succès:</strong> +229 66 00 00 01</li>
                <li>✅ <strong>MOOV succès:</strong> +229 64 00 00 01</li>
                <li>❌ <strong>Échec simulé:</strong> +229 66 00 00 00 ou +229 64 00 00 00</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Les vrais numéros ne fonctionnent pas en mode test.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {paymentStatus !== 'idle' ? (
          renderPaymentStatus()
        ) : (
          <div className="space-y-4 py-4">
            {paymentUrl ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Paiement en cours</AlertTitle>
                <AlertDescription>
                  Un paiement est déjà en attente pour ce rendez-vous. Cliquez sur "Ouvrir le paiement" pour le compléter.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Paiement sécurisé via FedaPay</AlertTitle>
                <AlertDescription>
                  Vos informations sont chiffrées et traitées par la passerelle régionale FedaPay. <strong>Une fenêtre popup s'ouvrira</strong> pour autoriser le paiement mobile money. <strong>Veuillez autoriser les popups</strong> pour ce site si votre navigateur les bloque.
                </AlertDescription>
              </Alert>
            )}

            {/* Méthodes sauvegardées */}
            {paymentMethods.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-saved"
                    checked={useSavedMethod}
                    onCheckedChange={(checked) => {
                      const isChecked = checked as boolean;
                      setUseSavedMethod(isChecked);
                      if (!isChecked) {
                        setPhoneNumber('');
                      }
                    }}
                  />
                  <Label htmlFor="use-saved" className="font-normal cursor-pointer">
                    Utiliser une méthode enregistrée
                  </Label>
                </div>

                {useSavedMethod && (
                  <Select value={selectedSavedMethod} onValueChange={setSelectedSavedMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez une méthode" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {MOBILE_MONEY_PROVIDERS[method.provider].name} - {method.phone_number_masked}
                          {method.is_default && ' (Par défaut)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {!useSavedMethod && (
              <>
                <div className="space-y-3">
                  <Label>Méthode de paiement</Label>
                  <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mtn" id="mtn" />
                      <Label htmlFor="mtn" className="font-normal cursor-pointer">
                        {MOBILE_MONEY_PROVIDERS.mtn.icon} {MOBILE_MONEY_PROVIDERS.mtn.name}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="moov" id="moov" />
                      <Label htmlFor="moov" className="font-normal cursor-pointer">
                        {MOBILE_MONEY_PROVIDERS.moov.icon} {MOBILE_MONEY_PROVIDERS.moov.name}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payer-name">Nom complet du payeur *</Label>
                  <Input
                    id="payer-name"
                    type="text"
                    placeholder="Ex: Jean Dupont"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Le nom du payeur sera enregistré dans FedaPay
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payer-email">Email du payeur (optionnel)</Label>
                  <Input
                    id="payer-email"
                    type="email"
                    placeholder="Ex: jean@example.com"
                    value={payerEmail}
                    onChange={(e) => setPayerEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    L'email permettra de recevoir les confirmations de paiement
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Numéro de téléphone *</Label>
                  <PhoneInput
                    id="phone"
                    value={phoneNumber}
                    onChange={(value) => setPhoneNumber(value)}
                    countryCode="+229"
                    localNumberLength={8}
                  />
                  <p className="text-sm text-muted-foreground">
                    Les deux formats sont acceptés : avec ou sans le préfixe 01
                  </p>
                </div>

                {/* Consentement pour sauvegarder */}
                <div className="flex items-start space-x-2 rounded-lg border p-3">
                  <Checkbox
                    id="save-method"
                    checked={saveMethod}
                    onCheckedChange={(checked) => setSaveMethod(checked as boolean)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="save-method"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Enregistrer cette méthode de paiement
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Je consens à ce que mon numéro soit enregistré de manière sécurisée pour faciliter mes futurs paiements.
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {selectedProvider.icon} {selectedProvider.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {phoneNumber ? `Numéro débité : ${phoneNumber}` : 'Numéro à confirmer'}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Montant</p>
                  <p className="text-base font-semibold">{formatAmount(amount)}</p>
                </div>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ReceiptText className="h-3 w-3" /> Une trace du paiement sera disponible dans vos reçus une fois l&apos;opération confirmée.
              </p>
            </div>
          </div>
        )}

        {/* Historique des tentatives */}
        {paymentStatus === 'idle' && context === 'appointment' && (
          <div className="mt-4">
            <PaymentAttemptsHistory appointmentId={contextId} />
          </div>
        )}

        {paymentStatus === 'idle' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeDialog} className="flex-1">
              Annuler
            </Button>
            <Button 
              onClick={() => {
                if (paymentUrl) {
                  window.open(paymentUrl, '_blank', 'noopener,noreferrer');
                } else {
                  handlePayment();
                }
              }} 
              disabled={isProcessing} 
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
                </>
              ) : paymentUrl ? (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ouvrir le paiement
                </>
              ) : (
                'Payer'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
