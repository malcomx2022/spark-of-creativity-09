import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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

type PaymentMethod = 'mtn' | 'orange' | 'moov';

interface FedaPayWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  amount: number;
  onSuccess?: () => void;
}

export function FedaPayWidget({ open, onOpenChange, appointmentId, amount, onSuccess }: FedaPayWidgetProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [saveMethod, setSaveMethod] = useState(false);
  const widgetRef = useRef<FedaPayCheckoutWidget | null>(null);
  
  const { paymentMethods, addPaymentMethod } = useSavedPaymentMethods();

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

    const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!sanitizedPhoneNumber) {
      toast({
        title: 'Erreur',
        description: 'Numéro de téléphone invalide. Format attendu: +229 XXXXXXXX',
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
      const { data: result, error } = await invokeEdgeFunctionWithRetry(
        'create-payment',
        {
          body: {
            appointmentId,
            amount,
            paymentMethod,
            phoneNumber: sanitizedPhoneNumber,
          },
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

      if (error) {
        console.error('Payment creation error:', error);
        throw error;
      }

      if (!result || typeof result !== 'object' || !('transactionId' in result)) {
        throw new Error('ID de transaction non reçu du serveur');
      }

      const txId = parseInt(String(result.transactionId));
      setTransactionId(txId);

      // Get FedaPay API key from environment
      // Note: You need to add VITE_FEDAPAY_PUBLIC_KEY to your .env file
      // For sandbox: pk_sandbox_xxxxx, For live: pk_live_xxxxx
      const fedapayPublicKey = import.meta.env.VITE_FEDAPAY_PUBLIC_KEY || 'pk_sandbox_default_key';
      
      if (!fedapayPublicKey || fedapayPublicKey === 'pk_sandbox_default_key') {
        console.warn('⚠️ FedaPay public key not configured. Please add VITE_FEDAPAY_PUBLIC_KEY to your .env file');
      }

      // Initialize FedaPay widget
      const widget = initFedaPayWidget({
        public_key: fedapayPublicKey,
        environment: import.meta.env.VITE_FEDAPAY_ENVIRONMENT || 'sandbox',
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

            toast({
              title: 'Paiement réussi !',
              description: 'Votre rendez-vous a été confirmé.',
            });

            if (onSuccess) {
              onSuccess();
            }

            setTimeout(() => {
              resetState();
              onOpenChange(false);
            }, 2000);
          } else if (payload.reason === DIALOG_DISMISSED) {
            // User closed the dialog
            setPaymentStatus('error');
            setIsProcessing(false);

            toast({
              title: 'Paiement annulé',
              description: 'Vous avez annulé le paiement.',
              variant: 'destructive',
            });
          }
        },
      });

      if (!widget) {
        throw new Error('Impossible d\'initialiser le widget de paiement');
      }

      widgetRef.current = widget;

      // Open the payment widget
      widget.open();

      toast({
        title: 'Paiement initié',
        description: 'Complétez le paiement dans la fenêtre qui vient de s\'ouvrir.',
      });
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
      setIsProcessing(false);

      const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement';

      toast({
        title: 'Erreur de paiement',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  const resetState = () => {
    setIsProcessing(false);
    setPaymentStatus('idle');
    setTransactionId(null);
    setPhoneNumber('');
    setSaveMethod(false);
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
                <Label htmlFor="phone">Numéro de téléphone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+229 XX XX XX XX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  disabled={isProcessing}
                />
                <p className="text-sm text-muted-foreground">
                  Format: +229 suivi de votre numéro
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
                Après avoir cliqué sur "Payer", une fenêtre s'ouvrira pour compléter le paiement via {MOBILE_MONEY_PROVIDERS[paymentMethod]?.name}.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isProcessing} className="flex-1">
                Annuler
              </Button>
              <Button type="submit" disabled={isProcessing || !phoneNumber} className="flex-1">
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
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-center text-muted-foreground">
              Complétez le paiement dans la fenêtre FedaPay...
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
