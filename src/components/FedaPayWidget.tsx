import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunctionWithRetry } from '@/lib/edge-function-retry';
import { useSavedPaymentMethods } from '@/hooks/useSavedPaymentMethods';
import { MOBILE_MONEY_PROVIDERS, formatAmount } from '@/lib/payment-config';
import { normalizePhoneNumber } from '@/lib/phone-utils';
import { 
  initFedaPayWidget, 
  isFedaPayLoaded, 
  CHECKOUT_COMPLETED, 
  DIALOG_DISMISSED,
  type FedaPayCheckoutWidget 
} from '@/lib/fedapay-widget';
import { clearPersistedPaymentState } from '@/lib/payment-storage';

type PaymentMethod = 'mtn' | 'moov';

interface FedaPayWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  amount: number;
  onSuccess?: () => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export function FedaPayWidget({ open, onOpenChange, appointmentId, amount, onSuccess, onComplete, onError }: FedaPayWidgetProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [saveMethod, setSaveMethod] = useState(false);
  const [fedapayConfig, setFedapayConfig] = useState<{ publicKey: string; environment: string } | null>(null);
  const widgetRef = useRef<FedaPayCheckoutWidget | null>(null);
  
  const { paymentMethods, addPaymentMethod } = useSavedPaymentMethods();

  // Load FedaPay configuration
  useEffect(() => {
    const loadFedaPayConfig = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-fedapay-config');
        if (error) throw error;
        setFedapayConfig(data);
      } catch (error) {
        console.error('Failed to load FedaPay config:', error);
        toast({
          title: 'Erreur de configuration',
          description: 'Impossible de charger la configuration de paiement',
          variant: 'destructive',
        });
      }
    };
    loadFedaPayConfig();
  }, []);

  // Load user profile data to pre-fill form
  useEffect(() => {
    const loadUserProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          if (profile.full_name) setPayerName(profile.full_name);
          if (profile.phone) setPhoneNumber(profile.phone);
        }
        
        // L'email vient de la session auth
        if (session.user.email) {
          setPayerEmail(session.user.email);
        }
      }
    };
    
    if (open) {
      loadUserProfile();
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

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFedaPayLoaded()) {
      toast({
        title: 'Erreur',
        description: 'Le système de paiement n\'est pas encore chargé. Veuillez réessayer.',
        variant: 'destructive',
      });
      return;
    }

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
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Vous devez être connecté pour effectuer un paiement');
      }

      console.log('Creating payment transaction...');

      // Create payment transaction via edge function
      const paymentBody: any = {
        appointmentId,
        amount,
        paymentMethod,
        phoneNumber: sanitizedPhoneNumber,
        payerName: payerName.trim(),
      };

      // Only include email if it's not empty
      if (payerEmail && payerEmail.trim()) {
        paymentBody.payerEmail = payerEmail.trim();
      }

      const { data: result, error } = await invokeEdgeFunctionWithRetry(
        'create-payment',
        {
          body: paymentBody,
        },
        3,
        (attempt) => {
          toast({
            title: `Tentative ${attempt + 1}...`,
            description: 'Nouvelle tentative de connexion au service de paiement.',
            duration: 2000,
          });
        }
      );

      // Gérer les erreurs
      if (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la création du paiement';
        
        // Parse l'erreur pour récupérer les détails du paiement en cours (409)
        let errorDetails: any = null;
        try {
          // Essayer de parser le message d'erreur comme JSON
          const errorMatch = errorMessage.match(/\{.*\}/);
          if (errorMatch) {
            errorDetails = JSON.parse(errorMatch[0]);
          }
        } catch (parseError) {
          console.error('Could not parse error details:', parseError);
        }
        
        // Vérifier si c'est une erreur 409 (paiement en attente)
        if (errorDetails && errorDetails.paymentId && errorDetails.retryAfter) {
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
                    resetState();
                    
                    // Rafraîchir la page après 1 seconde
                    setTimeout(() => window.location.reload(), 1000);
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
        } else if (errorMessage.includes('Un paiement est déjà en cours')) {
          // Fallback pour ancienne détection textuelle
          setIsProcessing(false);
          setPaymentStatus('error');
          
          toast({
            title: 'Paiement en cours',
            description: 'Un paiement est déjà en attente. Cliquez sur le bouton ci-dessous pour l\'annuler et recommencer.',
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
                    resetState();
                    
                    // Rafraîchir la page après 1 seconde
                    setTimeout(() => window.location.reload(), 1000);
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
        
        // Autre erreur
        throw new Error(errorMessage);
      }

      // Vérifier que nous avons reçu le transactionId
      if (!result || typeof result !== 'object' || !('transactionId' in result)) {
        throw new Error('ID de transaction non reçu du serveur. Veuillez réessayer.');
      }

      const txId = parseInt(String(result.transactionId));
      setTransactionId(txId);

      // Verify FedaPay configuration is loaded
      if (!fedapayConfig) {
        throw new Error('Configuration de paiement non disponible');
      }

      console.log('Initializing FedaPay widget with:', {
        transactionId: txId,
        environment: fedapayConfig.environment,
        amount
      });

      // Show pending status
      setPaymentStatus('pending');

      // Initialize FedaPay widget in popup mode (recommended)
      const widget = initFedaPayWidget({
        public_key: fedapayConfig.publicKey,
        environment: fedapayConfig.environment as 'sandbox' | 'live',
        transaction: {
          id: txId,
          amount: amount,
          description: `Paiement rendez-vous médical #${appointmentId}`,
        },
        customer: {
          phone_number: {
            number: sanitizedPhoneNumber,
            country: 'BJ',
          },
        },
        currency: {
          iso: 'XOF',
        },
        locale: 'fr',
        onComplete: async (payload) => {
            console.log('Payment completed:', payload);

            if (payload.reason === CHECKOUT_COMPLETED) {
              // Payment successful
              setPaymentStatus('success');
              setIsProcessing(false);

              // Save payment method if requested
              if (saveMethod) {
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

              // ✅ Nettoyer l'état de paiement persisté
              clearPersistedPaymentState();

              toast({
                title: 'Paiement réussi !',
                description: 'Votre rendez-vous a été confirmé.',
              });

              if (onSuccess) {
                onSuccess();
              }

              if (onComplete) {
                onComplete();
              }

              setTimeout(() => {
                resetState();
                onOpenChange(false);
              }, 2000);
            } else if (payload.reason === DIALOG_DISMISSED) {
              // User closed the dialog
              setPaymentStatus('error');
              setIsProcessing(false);

              // ✅ Nettoyer l'état de paiement persisté
              clearPersistedPaymentState();

              toast({
                title: 'Paiement annulé',
                description: 'Vous avez annulé le paiement.',
                variant: 'destructive',
              });

              if (onError) {
                onError(new Error('Paiement annulé par l\'utilisateur'));
              }
            }
          },
        });

      if (!widget) {
        throw new Error('Impossible d\'initialiser le widget de paiement');
      }

      widgetRef.current = widget;

      // Open the popup with error handling
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
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
      setIsProcessing(false);

      // ✅ Nettoyer l'état de paiement persisté en cas d'erreur
      clearPersistedPaymentState();

      const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement';

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
  };

  const resetState = () => {
    setIsProcessing(false);
    setPaymentStatus('idle');
    setTransactionId(null);
    setPhoneNumber('');
    setPayerName('');
    setPayerEmail('');
    setSaveMethod(false);
    
    // ✅ Nettoyer l'état de paiement persisté
    clearPersistedPaymentState();
    
    if (widgetRef.current) {
      try {
        widgetRef.current.close();
      } catch (error) {
        console.error('Error closing widget:', error);
      }
      widgetRef.current = null;
    }
  };

  const handleClose = () => {
    if (paymentStatus === 'pending' || isProcessing) {
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Paiement sécurisé</DialogTitle>
          <DialogDescription>
            Montant à payer: <strong>{formatAmount(amount)}</strong>
          </DialogDescription>
        </DialogHeader>

        {paymentStatus === 'success' && (
          <Alert className="border-success bg-success/10">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertDescription className="text-success">
              Paiement confirmé ! Votre rendez-vous est réservé.
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

        {paymentStatus === 'idle' && (
          <form onSubmit={handlePayment} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>Méthode de paiement *</Label>
                <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                  {Object.entries(MOBILE_MONEY_PROVIDERS).map(([id, provider]) => (
                    <div key={id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value={id} id={id} />
                      <Label htmlFor={id} className="flex items-center gap-3 cursor-pointer flex-1">
                        <span className="text-2xl">{provider.icon}</span>
                        <span className="font-medium">{provider.name}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payerName">Nom complet *</Label>
                <Input
                  id="payerName"
                  type="text"
                  placeholder="Prénom Nom"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  required
                  disabled={isProcessing}
                  minLength={2}
                />
                <p className="text-sm text-muted-foreground">
                  Votre nom complet tel qu'il apparaît sur votre compte mobile money
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payerEmail">Email (optionnel)</Label>
                <Input
                  id="payerEmail"
                  type="email"
                  placeholder="votre@email.com"
                  value={payerEmail}
                  onChange={(e) => setPayerEmail(e.target.value)}
                  disabled={isProcessing}
                />
                <p className="text-sm text-muted-foreground">
                  Pour recevoir la confirmation de paiement
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
                  disabled={isProcessing}
                />
                <p className="text-sm text-muted-foreground">
                  Les deux formats sont acceptés : avec ou sans le préfixe 01
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="save-method"
                  checked={saveMethod}
                  onCheckedChange={(checked) => setSaveMethod(checked as boolean)}
                  disabled={isProcessing}
                />
                <Label htmlFor="save-method" className="text-sm cursor-pointer">
                  Enregistrer cette méthode pour plus tard
                </Label>
              </div>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Une fenêtre popup s'ouvrira pour compléter votre paiement via {MOBILE_MONEY_PROVIDERS[paymentMethod]?.name}. <strong>Assurez-vous d'autoriser les popups</strong> pour ce site si votre navigateur les bloque.
              </AlertDescription>
            </Alert>

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
                  `Payer ${formatAmount(amount)}`
                )}
              </Button>
            </div>
          </form>
        )}

        {paymentStatus === 'pending' && (
          <div className="space-y-4">
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Complétez le paiement dans la fenêtre qui vient de s'ouvrir. Si la fenêtre ne s'affiche pas, veuillez autoriser les pop-ups pour ce site.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
