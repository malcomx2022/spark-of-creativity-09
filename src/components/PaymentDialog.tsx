import { useState, useEffect, useCallback, useRef } from 'react';
import { useLatest } from '@/hooks/useLatest';
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
import { api, auth, errorMessage as apiErrorMessage, isApiError } from '@/lib/api';
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

  // ✅ CORRECTION P1-5: Validation des sessionDetails pour le contexte group_session
  // ✅ CORRECTION P3-1: Logs structurés sans emojis
  if (context === 'group_session' && !sessionDetails) {
    console.warn('[PaymentDialog] sessionDetails manquant pour context=group_session');
  }
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const paymentOwnerRef = useRef(auth.getUser()?.id);
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
  const [networkErrorCount, setNetworkErrorCount] = useState(0);
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);
  // ✅ CORRECTION P2-7: État de chargement pour vérification paiement existant
  const [isCheckingExistingPayment, setIsCheckingExistingPayment] = useState(false);
  const hasRehydratedRef = useRef(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const widgetRef = useRef<import("@/lib/fedapay-widget").FedaPayCheckoutWidget>(null);
  // ✅ CORRECTION P0-2: Ref pour protection double-clic robuste (timestamp-based)
  const lastPaymentClickRef = useRef<number>(0);
  const DOUBLE_CLICK_THRESHOLD = 2000; // 2 secondes entre clics
  
  const { paymentMethods, addPaymentMethod, getDecryptedPhone } = useSavedPaymentMethods();

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
    setNetworkErrorCount(0);
    setShowNetworkWarning(false);
    hasRehydratedRef.current = false;
    clearPersistedPaymentState();
  }, []);

  // Lues par la vérification du paiement en cours (effet plus bas) et par le rappel du widget FedaPay.
  const existingPaymentProps = useLatest({ amount, context, contextId, fedapayConfig, onSuccess, onComplete, onOpenChange, resetPaymentState });

  // ✅ CORRECTION CRITIQUE #1: Charger la configuration FedaPay
  useEffect(() => {
    const loadFedaPayConfig = async () => {
      try {
        const data = await api.get<{ publicKey: string | null; environment: string; provider?: string }>('/payments/config', { auth: false });
        setFedapayConfig(data);
        
        // ✅ CORRECTION: Ne plus pré-remplir de numéro de test en sandbox
        // L'utilisateur doit entrer son propre numéro de téléphone
        // ✅ CORRECTION P3-1: Logs structurés sans emojis
        if (data?.environment === 'sandbox') {
          console.log('[FedaPay] Mode sandbox activé');
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
      const user = auth.getUser();
      if (!user) return;

      const profile = await api.get<{ full_name?: string | null; phone?: string | null }>('/profile').catch(() => null);

      if (profile) {
        // Préremplissage sans écraser une saisie (valeur courante, même arrivée pendant la requête).
        if (profile.full_name) {
          setPayerName((current) => current || profile.full_name || '');
        }
        if (profile.phone) {
          setPhoneNumber((current) => current || profile.phone || '');
        }
      }

      // Essayer de récupérer l'email depuis auth
      if (user.email) {
        setPayerEmail((current) => current || user.email || '');
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
      // Déclenchée par open / appointmentId / existingPaymentChecked seulement : le reste est lu à jour.
      const { amount, context, contextId, onOpenChange } = existingPaymentProps.current;
      // ✅ CORRECTION P2-7: Activer l'indicateur de chargement
      setIsCheckingExistingPayment(true);
      console.log(`Vérification d'un paiement existant pour ${context}:`, contextId);

      // ✅ CORRECTION P0-4: Récupérer l'utilisateur courant pour vérification d'autorisation
      const currentUser = auth.getUser();
      if (!currentUser) {
        console.error('❌ Utilisateur non authentifié');
        toast({
          title: 'Session expirée',
          description: 'Veuillez vous reconnecter pour continuer.',
          variant: 'destructive',
        });
        onOpenChange?.(false);
        return;
      }

      // Pour les rendez-vous, on vérifie via GET /payments?appointmentId= (propriété vérifiée par l'API)
      // Pour les séances de groupe, on vérifie l'inscription via GET /group-sessions/:id
      let existingPayment: { id: string; fedapay_payment_url: string | null; fedapay_transaction_id: string | null; status: string; created_at: string; patient_id: string } | null = null;

      if (context === 'appointment') {
        // ✅ CORRECTION P0-4: le rendez-vous doit appartenir au patient (403/404 renvoyés par l'API)
        try {
          const appointment = await api.get<{ id: string; patient_id: string }>(`/appointments/${contextId}`);
          if (appointment.patient_id !== currentUser.id) {
            throw Object.assign(new Error('forbidden'), { status: 403 });
          }
        } catch (error) {
          const forbidden = isApiError(error, 403) || (error as { status?: number })?.status === 403;
          console.error(forbidden ? '❌ Tentative non autorisée' : '❌ Rendez-vous non trouvé:', error);
          toast({
            title: forbidden ? 'Non autorisé' : 'Rendez-vous introuvable',
            description: forbidden ? 'Vous n\'êtes pas autorisé à effectuer ce paiement.' : 'Ce rendez-vous n\'existe pas ou a été supprimé.',
            variant: 'destructive',
          });
          onOpenChange?.(false);
          return;
        }

        const payments = await api.get<NonNullable<typeof existingPayment>[]>('/payments', { query: { appointmentId: contextId } }).catch(() => []);
        existingPayment = payments
          .filter((p) => ['initiated', 'pending'].includes(p.status) && p.patient_id === currentUser.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
      } else {
        // Pour les séances de groupe, vérifier l'inscription en attente
        const detail = await api.get<{ my_registration?: { id: string; payment_status: string | null } | null }>(`/group-sessions/${contextId}`).catch(() => null);
        if (detail?.my_registration?.payment_status === 'pending') {
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
            // POST /payments/:id/cancel remet aussi le rendez-vous en attente de praticien
            await api.post(`/payments/${existingPayment.id}/cancel`, {});

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
            // Configuration relue à chaque tour (elle arrive par un autre effet pendant l'attente).
            while (!existingPaymentProps.current.fedapayConfig && attempts < 10) {
              await new Promise(resolve => setTimeout(resolve, 300));
              attempts++;
            }
            return existingPaymentProps.current.fedapayConfig;
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
                const { onSuccess, onComplete, onOpenChange, resetPaymentState } = existingPaymentProps.current;
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
            await api.post(`/payments/${existingPayment.id}/cancel`, {});

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
        console.log('Aucun paiement en cours trouvé, création possible');
      }

      setExistingPaymentChecked(true);
      // ✅ CORRECTION P2-7: Désactiver l'indicateur de chargement
      setIsCheckingExistingPayment(false);
    };

    checkExistingPayment();
  }, [open, appointmentId, existingPaymentChecked, existingPaymentProps]);

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
    errorDetails?: Record<string, unknown>
  ) => {
    try {
      // Les tentatives sont journalisées côté API (payment_attempts) lors de POST /payments ;
      // on ne conserve ici que le compteur local pour l'affichage.
      void status; void errorMessage; void errorType; void errorDetails;
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
    // ✅ CORRECTION P0-2: Protection double-clic robuste avec ref timestamp
    // ✅ CORRECTION P3-1: Logs structurés sans emojis
    const now = Date.now();
    if (now - lastPaymentClickRef.current < DOUBLE_CLICK_THRESHOLD) {
      console.log('[Payment] Double-clic détecté, ignorer (délai:', now - lastPaymentClickRef.current, 'ms)');
      return;
    }
    lastPaymentClickRef.current = now;

    // Protection supplémentaire avec state
    if (isCreatingPayment) {
      console.log('[Payment] Création de paiement déjà en cours, ignorer');
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

    // ✅ CORRECTION P1-4: Validation robuste du numéro de téléphone avant normalisation
    if (!resolvedPhoneNumber || resolvedPhoneNumber.trim() === '') {
      setIsCreatingPayment(false);
      toast({
        title: 'Erreur',
        description: 'Veuillez saisir un numéro de téléphone',
        variant: 'destructive',
      });
      return;
    }

    const sanitizedPhoneNumber = normalizePhoneNumber(resolvedPhoneNumber);

    // Helper: Format phone number for FedaPay (remove +229 prefix for Benin)
    const formatPhoneForFedaPay = (phone: string | null): string => {
      if (!phone) return '';
      // Pour le Bénin, retirer le préfixe +229 pour sandbox FedaPay
      return phone.replace(/^\+229/, '');
    };

    if (!sanitizedPhoneNumber || sanitizedPhoneNumber.trim() === '') {
      setIsCreatingPayment(false);
      toast({
        title: 'Erreur',
        description: 'Numéro de téléphone invalide. Format attendu: +229 XXXXXXXX',
        variant: 'destructive',
      });
      return;
    }

    // Vérifier que le numéro a une longueur minimale valide après normalisation
    const phoneDigits = sanitizedPhoneNumber.replace(/\D/g, '');
    if (phoneDigits.length < 8) {
      setIsCreatingPayment(false);
      toast({
        title: 'Erreur',
        description: 'Le numéro de téléphone semble incomplet. Vérifiez qu\'il contient au moins 8 chiffres.',
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
      if (!auth.getSession()) {
        throw new Error('Vous devez être connecté pour effectuer un paiement');
      }

      console.log('Initiating payment:', { contextId, context, amount, paymentMethod });

      // ✅ Route de l'API selon le contexte (ex create-payment / register-group-session)
      let result: unknown;
      try {
        result = context === 'appointment'
          ? await api.post('/payments', {
              appointmentId: contextId,
              amount,
              paymentMethod,
              phoneNumber: sanitizedPhoneNumber,
              payerName: payerName.trim(),
              payerEmail: payerEmail.trim() || undefined,
            }, { timeoutMs: 60_000 })
          : await api.post(`/group-sessions/${contextId}/register`, {
              paymentMethod,
              phoneNumber: sanitizedPhoneNumber,
              payerName: payerName.trim() || undefined,
              payerEmail: payerEmail.trim() || undefined,
            }, { timeoutMs: 60_000 });
      } catch (error) {
        console.error('API payment error:', error);
        await recordPaymentAttempt('failed', apiErrorMessage(error), 'api_error', { error: apiErrorMessage(error) });
        setIsCreatingPayment(false);

        // 409 : un paiement est déjà en attente → proposer son annulation
        if (isApiError(error, 409)) {
          const body = (error.body ?? {}) as { paymentId?: string };
          console.log('409 error detected, showing cancel button');
          setIsProcessing(false);
          setPaymentStatus('error');

          toast({
            title: 'Paiement en cours',
            description: (error instanceof Error ? error.message : "") || 'Un paiement est déjà en attente',
            variant: 'destructive',
            duration: 10000,
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const pendingId = body.paymentId ?? (context === 'appointment'
                      ? (await api.get<{ id: string; status: string }[]>('/payments', { query: { appointmentId: contextId } })).find((p) => ['initiated', 'pending'].includes(p.status))?.id
                      : undefined);
                    if (!pendingId) throw new Error('Paiement en attente introuvable');
                    await api.post(`/payments/${pendingId}/cancel`, {});
                    
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

        throw new Error(apiErrorMessage(error, 'Erreur lors de la création du paiement'), { cause: error });
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
          throw new Error('Impossible d\'ouvrir la fenêtre de paiement. Veuillez autoriser les popups pour ce site et réessayer.', { cause: openError });
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

  const closeDialog = useCallback(() => {
    resetPaymentState();
    onOpenChange(false);
  }, [onOpenChange, resetPaymentState]);

  // ✅ CORRECTION P1-6: Poll payment status avec cleanup robuste et timeout appropriés
  useEffect(() => {
    // Cleanup immédiat si pas de paiement en cours
    if (paymentOwnerRef.current !== auth.getUser()?.id) return;
    if (!paymentId || paymentStatus !== 'pending') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollStartTimeRef.current = Date.now();
    let isMounted = true;
    let isPolling = false; // ✅ CORRECTION P1-6: Empêcher les polls concurrents

    const checkPaymentStatus = async () => {
      // ✅ CORRECTION P1-6: Éviter les polls concurrents si le précédent n'est pas terminé
      if (!isMounted || isPolling) return;
      isPolling = true;

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
        let payment: { status: string } | null = null;
        let error: unknown = null;
        try {
          payment = await api.get<{ status: string }>(`/payments/${paymentId}`);
        } catch (e) {
          error = e;
        }

        if (error) {
          console.error('Error polling payment:', error);
          // Incrémenter le compteur d'erreurs réseau
          setNetworkErrorCount(prev => {
            const newCount = prev + 1;
            // Afficher un avertissement après 3 erreurs consécutives
            if (newCount >= 3 && !showNetworkWarning) {
              setShowNetworkWarning(true);
              toast({
                title: '⚠️ Connexion instable',
                description: 'La vérification du paiement rencontre des difficultés réseau. Le paiement peut avoir réussi - ne fermez pas cette page.',
                variant: 'destructive',
                duration: 10000,
              });
            }
            return newCount;
          });
          return;
        }

        // Réinitialiser le compteur d'erreurs si la requête réussit
        if (networkErrorCount > 0) {
          setNetworkErrorCount(0);
          setShowNetworkWarning(false);
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
      } finally {
        isPolling = false; // ✅ CORRECTION P1-6: Libérer le verrou
      }
    };

    // ✅ CORRECTION P1-6: Vérification initiale immédiate
    checkPaymentStatus();

    pollIntervalRef.current = setInterval(checkPaymentStatus, POLL_INTERVAL);

    return () => {
      isMounted = false;
      isPolling = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [paymentId, paymentStatus, onSuccess, onComplete, closeDialog, networkErrorCount, showNetworkWarning]);

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
    }, paymentOwnerRef.current);
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

  // ✅ CORRECTION P2-6: Calculer si le formulaire est complet pour désactiver le bouton
  const isFormComplete = useSavedMethod
    ? !!selectedSavedMethod
    : !!(payerName.trim() && phoneNumber.trim());

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

        {/* ✅ CORRECTION P2-7: Indicateur de chargement pendant vérification */}
        {isCheckingExistingPayment && (
          <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Vérification en cours...</span>
          </div>
        )}

        {paymentStatus === 'idle' && !isCheckingExistingPayment && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeDialog} className="flex-1">
              Annuler
            </Button>
            {/* ✅ CORRECTION P2-6: Bouton désactivé si formulaire incomplet */}
            <Button
              onClick={() => {
                if (paymentUrl) {
                  window.open(paymentUrl, '_blank', 'noopener,noreferrer');
                } else {
                  handlePayment();
                }
              }}
              disabled={isProcessing || (!paymentUrl && !isFormComplete)}
              className="flex-1"
              title={!isFormComplete && !paymentUrl ? 'Veuillez remplir tous les champs requis' : undefined}
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
