import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Calendar, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api, auth, errorMessage, isApiError } from '@/lib/api';
import { useSavedPaymentMethods } from '@/hooks/useSavedPaymentMethods';
import { MOBILE_MONEY_PROVIDERS, formatAmount } from '@/lib/payment-config';
import { normalizePhoneNumber } from '@/lib/phone-utils';
import { clearPersistedPaymentState } from '@/lib/payment-storage';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type CurrentSession = {
  id: string; session_name: string; scheduled_date: string; start_time: string; status: string | null;
  max_participants: number; current_participants: number | null; price_per_person: number;
  coach: { id: string; verified?: boolean } | null;
  spots_remaining?: number;
  my_registration?: { id: string; payment_status: string | null; joined_at: string } | null;
};

type PaymentMethod = 'mtn' | 'moov';

interface GroupSessionPaymentWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    id: string;
    session_name: string;
    price_per_person: number;
    scheduled_date: string;
    start_time: string;
    current_participants?: number;
    max_participants?: number;
  };
  onSuccess?: () => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function GroupSessionPaymentWidget({ 
  open, 
  onOpenChange, 
  session, 
  onSuccess, 
  onComplete, 
  onError 
}: GroupSessionPaymentWidgetProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error' | 'already_registered' | 'session_full' | 'session_past'>('idle');
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [saveMethod, setSaveMethod] = useState(false);
  const [fedapayConfig, setFedapayConfig] = useState<{ publicKey: string; environment: string } | null>(null);
  const [widgetInitialized, setWidgetInitialized] = useState(false);
  const [existingRegistration, setExistingRegistration] = useState<CurrentSession["my_registration"]>(null);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<CurrentSession>(null);
  // ✅ Bug #2 FIX: Ajouter protection chargement script FedaPay
  const [fedapayScriptLoaded, setFedapayScriptLoaded] = useState(false);
  const [fedapayLoadError, setFedapayLoadError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fedapayLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const queryClient = useQueryClient();
  const { addPaymentMethod } = useSavedPaymentMethods();

  // ✅ Bug #2 FIX: Vérifier si le script FedaPay est chargé avec timeout
  useEffect(() => {
    const FEDAPAY_LOAD_TIMEOUT = 15000; // 15 secondes

    const checkFedaPayLoaded = () => {
      return typeof window !== 'undefined' && window.FedaPay;
    };

    // Vérification immédiate
    if (checkFedaPayLoaded()) {
      setFedapayScriptLoaded(true);
      return;
    }

    // Polling pour vérifier le chargement
    const pollInterval = setInterval(() => {
      if (checkFedaPayLoaded()) {
        setFedapayScriptLoaded(true);
        clearInterval(pollInterval);
        if (fedapayLoadTimeoutRef.current) {
          clearTimeout(fedapayLoadTimeoutRef.current);
        }
      }
    }, 500);

    // Timeout si le script ne charge pas
    fedapayLoadTimeoutRef.current = setTimeout(() => {
      clearInterval(pollInterval);
      if (!checkFedaPayLoaded()) {
        console.error('FedaPay script failed to load within timeout');
        setFedapayLoadError(true);
        toast({
          title: 'Service de paiement indisponible',
          description: 'Le service de paiement n\'a pas pu être chargé. Veuillez rafraîchir la page.',
          variant: 'destructive',
          duration: 10000,
        });
      }
    }, FEDAPAY_LOAD_TIMEOUT);

    return () => {
      clearInterval(pollInterval);
      if (fedapayLoadTimeoutRef.current) {
        clearTimeout(fedapayLoadTimeoutRef.current);
      }
    };
  }, []);

  // ✅ CORRECTION P2 #12 & P0 #1-2: Vérifier disponibilité et validité AVANT affichage formulaire
  useEffect(() => {
    const checkSessionAndRegistration = async () => {
      if (!open) return;

      setIsCheckingRegistration(true);

      try {
        if (!auth.getSession()) {
          setIsCheckingRegistration(false);
          return;
        }

        // ✅ CORRECTION P2 #12: informations actuelles de la séance (places, coach vérifié, inscription existante)
        let currentSession: CurrentSession;
        try {
          currentSession = await api.get(`/group-sessions/${session.id}`);
        } catch (error) {
          console.error('Erreur récupération séance:', error);
          toast({
            title: 'Erreur',
            description: 'Impossible de récupérer les informations de la séance',
            variant: 'destructive',
          });
          setIsCheckingRegistration(false);
          return;
        }

        setSessionInfo(currentSession);

        // ✅ CORRECTION P0 #2: Vérifier si la séance n'est pas passée
        const sessionDateTime = new Date(currentSession.scheduled_date + 'T' + currentSession.start_time);
        if (sessionDateTime < new Date()) {
          setPaymentStatus('session_past');
          setIsCheckingRegistration(false);
          return;
        }

        // Vérifier le statut de la séance
        if (currentSession.status === 'annulee' || currentSession.status === 'terminee') {
          toast({
            title: 'Séance non disponible',
            description: `Cette séance est ${currentSession.status === 'annulee' ? 'annulée' : 'terminée'}.`,
            variant: 'destructive',
          });
          onOpenChange(false);
          return;
        }

        // ✅ CORRECTION P0 #1: Vérifier le KYC du coach (champ `verified` calculé par l'API)
        if (!currentSession.coach || !currentSession.coach.verified) {
          toast({
            title: 'Inscription non disponible',
            description: 'Le coach n\'est pas encore vérifié. Veuillez réessayer plus tard.',
            variant: 'destructive',
          });
          onOpenChange(false);
          return;
        }

        // ✅ CORRECTION P2 #12: Vérifier les places AVANT affichage formulaire
        const availableSpots = currentSession.spots_remaining ?? ((currentSession.max_participants || 0) - (currentSession.current_participants || 0));
        if (availableSpots <= 0) {
          setPaymentStatus('session_full');
          setIsCheckingRegistration(false);
          return;
        }

        // Vérifier si le patient est déjà inscrit à cette séance
        const existingParticipant = currentSession.my_registration ?? null;
        if (existingParticipant) {
          console.log('🔍 Inscription existante trouvée:', existingParticipant);
          setExistingRegistration(existingParticipant);

          if (existingParticipant.payment_status === 'paid' || existingParticipant.payment_status === 'confirmed') {
            setPaymentStatus('already_registered');
          } else if (existingParticipant.payment_status === 'pending') {
            // Paiement en attente - permettre de continuer
            console.log('⏳ Paiement en attente existant');
          }
        }
      } catch (error) {
        console.error('Erreur vérification:', error);
      } finally {
        setIsCheckingRegistration(false);
      }
    };

    checkSessionAndRegistration();
  }, [open, session.id]);

  // Load FedaPay configuration
  useEffect(() => {
    const loadFedaPayConfig = async () => {
      try {
        const data = await api.get<{ publicKey: string | null; environment: string; provider?: string }>('/payments/config', { auth: false });
        setFedapayConfig(data);

        // ✅ Bug #1 FIX: NE PAS pré-remplir le numéro de test
        // Les numéros de test sont affichés dans l'alerte visuelle
        if (data?.environment === 'sandbox') {
          console.log('🧪 MODE SANDBOX - Numéros de test disponibles dans l\'interface');
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

  // Load user profile data to pre-fill form
  useEffect(() => {
    const loadUserProfile = async () => {
      const currentUser = auth.getUser();
      if (currentUser) {
        const profile = await api.get<{ full_name?: string | null; phone?: string | null }>('/profile').catch(() => null);

        if (profile) {
          if (profile.full_name) setPayerName(profile.full_name);
          if (profile.phone) setPhoneNumber(profile.phone);
        }

        if (currentUser.email) {
          setPayerEmail(currentUser.email);
        }
      }
    };
    
    if (open) {
      loadUserProfile();
    }
  }, [open]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fedapayConfig) {
      toast({
        title: 'Erreur',
        description: 'Configuration de paiement non disponible. Veuillez rafraîchir la page.',
        variant: 'destructive',
      });
      return;
    }

    // Validation du nom du payeur
    if (!payerName.trim() || payerName.trim().length < 2) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer votre nom complet (minimum 2 caractères)',
        variant: 'destructive',
      });
      return;
    }

    // Validation et normalisation du numéro de téléphone
    const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!sanitizedPhoneNumber) {
      toast({
        title: 'Erreur',
        description: 'Numéro de téléphone invalide. Format attendu: +229 XXXXXXXX ou +229 01 XX XX XX XX',
        variant: 'destructive',
      });
      return;
    }

    // Validation regex côté frontend
    const phoneRegex = /^\+229(01)?\d{8}$/;
    if (!phoneRegex.test(sanitizedPhoneNumber)) {
      toast({
        title: 'Erreur',
        description: 'Format de numéro invalide. Utilisez +229XXXXXXXX ou +2290101XXXXXXXX',
        variant: 'destructive',
      });
      return;
    }

    // Validation email si fourni
    if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      toast({
        title: 'Erreur',
        description: 'Format d\'email invalide',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setPaymentStatus('pending');

    try {
      if (!auth.getSession()) {
        throw new Error('Vous devez être connecté pour effectuer un paiement');
      }

      console.log('Creating group session registration and payment...', {
        sessionId: session.id,
        amount: session.price_per_person,
        paymentMethod
      });

      // POST /group-sessions/:id/register : inscription ET paiement FedaPay (ex register-group-session)
      let result: { success: boolean; participantId?: string; transactionId?: string | number; paymentUrl?: string; token?: string; amount?: number };
      try {
        result = await api.post(`/group-sessions/${session.id}/register`, {
          paymentMethod,
          phoneNumber: sanitizedPhoneNumber,
          payerName: payerName.trim(),
          payerEmail: payerEmail.trim() || undefined,
        });
      } catch (error) {
        // Inscription déjà existante (409) : message explicite
        if (isApiError(error, 409)) {
          setIsProcessing(false);
          setPaymentStatus('error');

          toast({
            title: 'Inscription existante',
            description: errorMessage(error, 'Vous êtes déjà inscrit à cette séance.'),
            variant: 'destructive',
            duration: 10000,
          });
          return;
        }
        throw new Error(errorMessage(error, 'Erreur lors de l\'inscription'));
      }

      // Vérifier que nous avons reçu le transactionId
      if (!result || typeof result !== 'object' || !('transactionId' in result)) {
        throw new Error('ID de transaction non reçu du serveur. Veuillez réessayer.');
      }

      const txId = parseInt(String(result.transactionId));
      setTransactionId(txId);

      console.log('Registration and payment transaction created successfully:', {
        transactionId: txId,
        participantId: result.participantId,
        environment: fedapayConfig.environment,
        amount: session.price_per_person
      });

      // Initialize FedaPay widget
      setPaymentStatus('pending');
      setIsProcessing(false);
      
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
      setIsProcessing(false);

      clearPersistedPaymentState();

      const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement';

      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000,
      });

      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMessage));
      }
    }
  };

  const resetState = () => {
    setIsProcessing(false);
    setPaymentStatus('idle');
    setTransactionId(null);
    setSaveMethod(false);
    setWidgetInitialized(false);
    setExistingRegistration(null);
    setIsCheckingRegistration(true);
    
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    
    clearPersistedPaymentState();
  };

  const handleClose = () => {
    // Permettre de fermer si déjà inscrit
    if (paymentStatus === 'already_registered') {
      resetState();
      onOpenChange(false);
      return;
    }
    
    if ((paymentStatus === 'pending' || isProcessing) && paymentStatus !== 'success') {
      toast({
        title: 'Paiement en cours',
        description: 'Veuillez compléter ou annuler le paiement avant de fermer.',
        variant: 'destructive',
      });
      return;
    }
    resetState();
    onOpenChange(false);
  };

  // Initialize FedaPay widget when we have transactionId
  useEffect(() => {
    if (paymentStatus === 'pending' && transactionId && fedapayConfig && containerRef.current && !widgetInitialized) {
      console.log('Initializing FedaPay widget with transaction:', transactionId);

      // ✅ Bug #2 FIX: Vérifier si le script a eu une erreur de chargement
      if (fedapayLoadError) {
        console.error('FedaPay script failed to load, cannot initialize widget');
        setPaymentStatus('error');
        toast({
          title: 'Erreur de paiement',
          description: 'Le service de paiement n\'est pas disponible. Veuillez rafraîchir la page et réessayer.',
          variant: 'destructive',
        });
        return;
      }

      // Attendre que le script soit chargé
      if (!fedapayScriptLoaded) {
        console.log('Waiting for FedaPay script to load...');
        return;
      }

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      if (typeof window !== 'undefined' && window.FedaPay) {
        try {
          const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);
          const phoneForFedaPay = sanitizedPhoneNumber ? sanitizedPhoneNumber.replace(/^\+229/, '') : '';
          
          const widget = window.FedaPay.init({
            public_key: fedapayConfig.publicKey,
            transaction: {
              id: transactionId,
              amount: session.price_per_person,
              description: `Inscription séance: ${session.session_name}`,
            },
            customer: {
              email: payerEmail || undefined,
              firstname: payerName.split(' ')[0] || 'Patient',
              lastname: payerName.split(' ').slice(1).join(' ') || 'Test',
              phone_number: phoneForFedaPay ? {
                number: phoneForFedaPay,
                country: 'bj',
              } : undefined,
            },
            currency: {
              iso: 'XOF',
            },
            container: '#fedapay-group-container',
            onComplete: async (data: import("@/lib/fedapay-widget").FedaPayCompletePayload) => {
              console.log('FedaPay onComplete:', data);
              
              const isSuccess = data.reason === "CHECKOUT COMPLETE" || 
                               data.reason === 1 || 
                               data.transaction?.status === "approved";
              
              if (isSuccess) {
                console.log('Payment completed successfully');
                setPaymentStatus('success');
                setIsProcessing(false);

                clearPersistedPaymentState();

                // ✅ Bug #5 FIX: Sauvegarder la méthode de paiement si demandé
                if (saveMethod && phoneNumber) {
                  try {
                    const sanitizedPhone = normalizePhoneNumber(phoneNumber);
                    if (sanitizedPhone) {
                      await addPaymentMethod({
                        provider: paymentMethod,
                        phoneNumber: sanitizedPhone,
                        setAsDefault: true,
                      });
                      console.log('Payment method saved successfully');
                    }
                  } catch (saveError) {
                    console.error('Failed to save payment method:', saveError);
                    // Ne pas bloquer le succès du paiement si la sauvegarde échoue
                  }
                }
                
                // Synchroniser et rafraîchir
                const syncAndRefresh = async () => {
                  try {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    // Invalider les queries
                    console.log('Refreshing group session data...');
                    await queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
                    await queryClient.invalidateQueries({ queryKey: ['patient-group-sessions'] });
                    await queryClient.refetchQueries({ queryKey: ['group-sessions'] });
                    await queryClient.refetchQueries({ queryKey: ['patient-group-sessions'] });
                    
                    toast({
                      title: '✅ Inscription confirmée',
                      description: `Vous êtes inscrit à la séance "${session.session_name}"`,
                      duration: 5000,
                    });
                  } catch (error) {
                    console.error('Sync/refresh error:', error);
                  }
                };
                
                syncAndRefresh();
                
                if (onSuccess) onSuccess();
                if (onComplete) onComplete();
                
                setTimeout(() => {
                  resetState();
                  onOpenChange(false);
                }, 4000);
              } else if (data.reason === 2 || data.reason === "DIALOG_DISMISSED") {
                console.log('Payment dialog dismissed');
                setPaymentStatus('error');
                setIsProcessing(false);
                
                toast({
                  title: '❌ Paiement annulé',
                  description: 'Vous avez fermé la fenêtre de paiement',
                  variant: 'destructive',
                });
              }
            },
          });
          
          setWidgetInitialized(true);
          console.log('FedaPay widget initialized successfully');
        } catch (error) {
          console.error('Error initializing FedaPay widget:', error);
          setPaymentStatus('error');
          toast({
            title: 'Erreur d\'initialisation',
            description: 'Impossible d\'initialiser le formulaire de paiement. Veuillez réessayer.',
            variant: 'destructive',
          });
        }
      } else {
        console.error('FedaPay script not loaded');
        setPaymentStatus('error');
        toast({
          title: 'Erreur de chargement',
          description: 'Le service de paiement n\'est pas disponible. Veuillez rafraîchir la page.',
          variant: 'destructive',
        });
      }
    }
  }, [paymentStatus, transactionId, fedapayConfig, widgetInitialized, fedapayScriptLoaded, fedapayLoadError, phoneNumber, payerName, payerEmail, session]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inscription et paiement</DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{session.session_name}</span> - {formatAmount(session.price_per_person)}
          </DialogDescription>
        </DialogHeader>

        {/* Détails de la séance */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary" />
            <span>{format(new Date(session.scheduled_date), 'EEEE d MMMM yyyy', { locale: fr })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            <span>{session.start_time}</span>
          </div>
          {session.current_participants !== undefined && session.max_participants && (
            <div className="text-sm text-muted-foreground">
              Places: {session.current_participants} / {session.max_participants} participants
            </div>
          )}
        </div>

        {/* Alerte pour mode sandbox */}
        {fedapayConfig?.environment === 'sandbox' && (
          <Alert className="border-primary/50 bg-primary/5">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              <p className="font-semibold mb-2">Mode Test - Utilisez ces numéros :</p>
              <ul className="space-y-1 text-xs">
                <li>✅ <strong>MTN succès:</strong> +229 66 00 00 01</li>
                <li>✅ <strong>MOOV succès:</strong> +229 64 00 00 01</li>
                <li>❌ <strong>Échec simulé:</strong> +229 66 00 00 00 ou +229 64 00 00 00</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Chargement vérification inscription */}
        {isCheckingRegistration && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Vérification de votre inscription...</span>
          </div>
        )}

        {/* ✅ CORRECTION P2 #12: Séance complète */}
        {paymentStatus === 'session_full' && (
          <div className="space-y-4">
            <Alert className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800 dark:text-orange-200">
                <p className="font-semibold">Séance complète</p>
                <p className="text-sm mt-1">
                  Toutes les places pour cette séance sont déjà réservées.
                </p>
              </AlertDescription>
            </Alert>
            <Button onClick={handleClose} className="w-full">
              Fermer
            </Button>
          </div>
        )}

        {/* ✅ CORRECTION P0 #2: Séance passée */}
        {paymentStatus === 'session_past' && (
          <div className="space-y-4">
            <Alert className="border-red-500 bg-red-50 dark:bg-red-950/20">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                <p className="font-semibold">Séance passée</p>
                <p className="text-sm mt-1">
                  Cette séance a déjà eu lieu. Vous ne pouvez plus vous inscrire.
                </p>
              </AlertDescription>
            </Alert>
            <Button onClick={handleClose} className="w-full">
              Fermer
            </Button>
          </div>
        )}

        {/* Déjà inscrit */}
        {paymentStatus === 'already_registered' && (
          <div className="space-y-4">
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <p className="font-semibold">Vous êtes déjà inscrit(e) à cette séance !</p>
                <p className="text-sm mt-1">
                  Votre inscription a été confirmée. Rendez-vous le {format(new Date(session.scheduled_date), 'd MMMM yyyy', { locale: fr })} à {session.start_time}.
                </p>
              </AlertDescription>
            </Alert>
            <Button onClick={handleClose} className="w-full">
              Fermer
            </Button>
          </div>
        )}

        {paymentStatus === 'success' && (
          <Alert className="border-success bg-success/10">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertDescription className="text-success">
              Inscription confirmée ! Vous êtes inscrit à cette séance.
            </AlertDescription>
          </Alert>
        )}

        {paymentStatus === 'error' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Le paiement a échoué ou a été annulé. Veuillez réessayer.
            </AlertDescription>
          </Alert>
        )}

        {paymentStatus === 'idle' && !isCheckingRegistration && (
          <form onSubmit={handlePayment} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Méthode de paiement *</Label>
                <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                  {Object.entries(MOBILE_MONEY_PROVIDERS).map(([id, provider]) => (
                    <div key={id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value={id} id={`group-${id}`} />
                      <Label htmlFor={`group-${id}`} className="flex items-center gap-3 cursor-pointer flex-1">
                        <span className="text-2xl">{provider.icon}</span>
                        <span className="font-medium">{provider.name}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="groupPayerName">Nom complet *</Label>
                <Input
                  id="groupPayerName"
                  type="text"
                  placeholder="Prénom Nom"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  required
                  disabled={isProcessing}
                  minLength={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="groupPayerEmail">Email (optionnel)</Label>
                <Input
                  id="groupPayerEmail"
                  type="email"
                  placeholder="votre@email.com"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  disabled={isProcessing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="groupPhone">Numéro de téléphone *</Label>
                <PhoneInput
                  id="groupPhone"
                  value={phoneNumber}
                  onChange={(value) => setPhoneNumber(value)}
                  countryCode="+229"
                  localNumberLength={8}
                  disabled={isProcessing}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="group-save-method"
                  checked={saveMethod}
                  onCheckedChange={(checked) => setSaveMethod(checked as boolean)}
                  disabled={isProcessing}
                />
                <Label htmlFor="group-save-method" className="text-sm cursor-pointer">
                  Enregistrer cette méthode pour plus tard
                </Label>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isProcessing} className="flex-1">
                Annuler
              </Button>
              <Button type="submit" disabled={isProcessing || !phoneNumber || !payerName} className="flex-1">
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Traitement...
                  </>
                ) : (
                  `S'inscrire et payer ${formatAmount(session.price_per_person)}`
                )}
              </Button>
            </div>
          </form>
        )}

        {paymentStatus === 'pending' && transactionId && fedapayConfig && (
          <div className="space-y-4">
            <Alert className="border-primary/50 bg-primary/5">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertDescription>
                <p className="font-semibold mb-2">Complétez votre paiement</p>
                <p className="text-sm text-muted-foreground">
                  Remplissez le formulaire ci-dessous pour finaliser votre inscription.
                </p>
              </AlertDescription>
            </Alert>
            
            {/* FedaPay Embedded Container */}
            <div 
              id="fedapay-group-container" 
              ref={containerRef}
              className="w-full min-h-[420px] border rounded-lg overflow-hidden"
              style={{ height: '420px' }}
            />
            
            <Button 
              variant="outline" 
              onClick={() => {
                resetState();
                onOpenChange(false);
              }}
              className="w-full"
            >
              Annuler
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
