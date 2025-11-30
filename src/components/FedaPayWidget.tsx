import { useEffect, useState, useRef } from 'react';
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
import { clearPersistedPaymentState } from '@/lib/payment-storage';
import { useQueryClient } from '@tanstack/react-query';

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
  const [widgetInitialized, setWidgetInitialized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const { paymentMethods, addPaymentMethod } = useSavedPaymentMethods();

  // Load FedaPay configuration
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

    // Helper: Format phone number for FedaPay (remove +229 prefix for Benin)
    const formatPhoneForFedaPay = (phone: string | null): string => {
      if (!phone) return '';
      // Pour le Bénin, retirer le préfixe +229 pour sandbox FedaPay
      return phone.replace(/^\+229/, '');
    };

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
        console.error('Payment creation error:', errorMessage);
        console.log('Full error object:', JSON.stringify(error, null, 2));
        
        // Parse l'erreur pour récupérer les détails du paiement en cours (409)
        let errorDetails: any = null;
        
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
            title: '⏳ Paiement déjà en cours',
            description: errorDetails.error || 'Un paiement est déjà en attente pour ce rendez-vous.',
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
                      title: '✅ Paiement annulé',
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

      console.log('Payment transaction created successfully:', {
        transactionId: txId,
        environment: fedapayConfig.environment,
        amount
      });

      // Initialize FedaPay widget with embedded mode
      setPaymentStatus('pending');
      setIsProcessing(false);
      
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
      setIsProcessing(false);

      // ✅ Nettoyer l'état de paiement persisté en cas d'erreur
      clearPersistedPaymentState();

      const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement';

      // Ne pas afficher de toast si c'est une erreur 409 déjà gérée
      const is409Handled = errorMessage.includes('paymentId') || errorMessage.includes('existingPaymentStatus');
      
      if (!is409Handled) {
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

  const resetState = () => {
    setIsProcessing(false);
    setPaymentStatus('idle');
    setTransactionId(null);
    setPhoneNumber('');
    setPayerName('');
    setPayerEmail('');
    setSaveMethod(false);
    setWidgetInitialized(false);
    
    // Clear container
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    
    // ✅ Nettoyer l'état de paiement persisté
    clearPersistedPaymentState();
  };

  const handleClose = () => {
    // Only block closing if payment is actively pending (not if it's successful)
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
      
      // Clear container first
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      
      // Check if FedaPay is loaded
      if (typeof window !== 'undefined' && (window as any).FedaPay) {
        try {
          const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);
          const phoneForFedaPay = sanitizedPhoneNumber ? sanitizedPhoneNumber.replace(/^\+229/, '') : '';
          
          // Initialize FedaPay widget in embedded mode
          const widget = (window as any).FedaPay.init({
            public_key: fedapayConfig.publicKey,
            transaction: {
              id: transactionId,
              amount: amount,
              description: `Paiement rendez-vous médical #${appointmentId.substring(0, 8)}`,
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
            container: '#fedapay-container',
            onComplete: (data: any) => {
              console.log('FedaPay onComplete:', data);
              
              // Check for successful payment - FedaPay returns "CHECKOUT COMPLETE" as string
              const isSuccess = data.reason === "CHECKOUT COMPLETE" || 
                               data.reason === 1 || 
                               data.transaction?.status === "approved";
              
              if (isSuccess) {
                console.log('Payment completed successfully');
                setPaymentStatus('success');
                setIsProcessing(false);
                
                // Effacer le paiement persisté
                clearPersistedPaymentState();
                
                // Invalider les queries pour rafraîchir l'interface
                queryClient.invalidateQueries({ queryKey: ['payments'] });
                queryClient.invalidateQueries({ queryKey: ['appointments'] });
                queryClient.invalidateQueries({ queryKey: ['patient-appointments'] });
                
                toast({
                  title: '✅ Paiement réussi',
                  description: 'Votre paiement a été confirmé avec succès',
                });
                
                if (onSuccess) onSuccess();
                if (onComplete) onComplete();
                
                // Close immediately after success
                setTimeout(() => {
                  resetState();
                  onOpenChange(false);
                }, 500);
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
  }, [paymentStatus, transactionId, fedapayConfig, widgetInitialized, phoneNumber, payerName, payerEmail, amount, appointmentId]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paiement sécurisé</DialogTitle>
          <DialogDescription>
            Montant à payer: <strong>{formatAmount(amount)}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Alerte pour mode sandbox avec numéros de test */}
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
              <p className="mt-2 text-xs text-muted-foreground">
                Les vrais numéros ne fonctionnent pas en mode test.
              </p>
            </AlertDescription>
          </Alert>
        )}

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

            <Alert className="border-primary/50 bg-primary/5">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertDescription>
                Un formulaire de paiement s'affichera ci-dessous pour compléter votre transaction via {MOBILE_MONEY_PROVIDERS[paymentMethod]?.name}.
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

        {paymentStatus === 'pending' && transactionId && fedapayConfig && (
          <div className="space-y-4">
            <Alert className="border-primary/50 bg-primary/5">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <AlertDescription>
                <p className="font-semibold mb-2">Complétez votre paiement</p>
                <p className="text-sm text-muted-foreground">
                  Remplissez le formulaire ci-dessous pour finaliser votre paiement sécurisé via FedaPay.
                </p>
              </AlertDescription>
            </Alert>
            
            {/* FedaPay Embedded Container */}
            <div 
              id="fedapay-container" 
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
