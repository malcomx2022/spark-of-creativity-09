import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSavedPaymentMethods } from '@/hooks/useSavedPaymentMethods';
import { MOBILE_MONEY_PROVIDERS } from '@/lib/payment-config';

type PaymentMethod = 'mtn' | 'orange' | 'moov';

interface PaymentResponse {
  paymentUrl?: string;
  status?: string;
  paymentId?: string;
  idempotencyKey?: string;
}

const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/[^0-9+]/g, '');

  if ((normalized.match(/\+/g) ?? []).length > 1) {
    return null;
  }

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+')) {
    normalized = `+${normalized.replace(/\+/g, '')}`;
  }

  const digits = normalized.slice(1);

  if (!/^\d{8,15}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}

function isPaymentResponse(payload: unknown): payload is PaymentResponse {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  const { paymentUrl, status } = candidate;

  if (paymentUrl !== undefined && typeof paymentUrl !== 'string') {
    return false;
  }

  if (status !== undefined && typeof status !== 'string') {
    return false;
  }

  return true;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  amount: number;
  onSuccess?: () => void;
}

export function PaymentDialog({ open, onOpenChange, appointmentId, amount, onSuccess }: PaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [saveMethod, setSaveMethod] = useState(false);
  const [useSavedMethod, setUseSavedMethod] = useState(false);
  const [selectedSavedMethod, setSelectedSavedMethod] = useState<string>('');
  
  const { paymentMethods, addPaymentMethod, getDecryptedPhone } = useSavedPaymentMethods();

  // Charger la méthode par défaut
  useEffect(() => {
    const defaultMethod = paymentMethods.find(m => m.is_default);
    if (defaultMethod && !phoneNumber) {
      setUseSavedMethod(true);
      setSelectedSavedMethod(defaultMethod.id);
      setPaymentMethod(defaultMethod.provider);
      setPhoneNumber(getDecryptedPhone(defaultMethod));
    }
  }, [paymentMethods, phoneNumber, getDecryptedPhone]);

  // Poll payment status
  useEffect(() => {
    if (!paymentId || paymentStatus !== 'pending') return;

    const startTime = Date.now();
    let pollInterval: NodeJS.Timeout;
    
    const checkPaymentStatus = async () => {
      try {
        // Check if max poll time exceeded
        if (Date.now() - startTime > MAX_POLL_TIME) {
          clearInterval(pollInterval);
          setPaymentStatus('error');
          setIsProcessing(false);
          toast({
            variant: "destructive",
            title: "Délai dépassé",
            description: "Le paiement prend trop de temps. Veuillez vérifier votre téléphone et contacter le support si nécessaire.",
          });
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

        setPollCount(prev => prev + 1);

        if (payment.status === 'paid') {
          clearInterval(pollInterval);
          setPaymentStatus('success');
          setIsProcessing(false);
          toast({
            title: "Paiement réussi !",
            description: "Votre rendez-vous a été confirmé.",
          });
          
          if (onSuccess) {
            onSuccess();
          }
          
          // Close dialog after success
          setTimeout(() => {
            handleClose();
          }, 2000);
        } else if (['failed', 'canceled'].includes(payment.status)) {
          clearInterval(pollInterval);
          setPaymentStatus('error');
          setIsProcessing(false);
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

    pollInterval = setInterval(checkPaymentStatus, POLL_INTERVAL);
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [paymentId, paymentStatus, onSuccess]);

  const handlePayment = async () => {
    // Si une méthode sauvegardée est sélectionnée, l'utiliser
    if (useSavedMethod && selectedSavedMethod) {
      const method = paymentMethods.find(m => m.id === selectedSavedMethod);
      if (method) {
        setPaymentMethod(method.provider);
        setPhoneNumber(getDecryptedPhone(method));
      }
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

      const { data: result, error } = await supabase.functions.invoke('create-payment', {
        body: {
          appointmentId,
          amount,
          paymentMethod,
          phoneNumber: sanitizedPhoneNumber,
        },
      });

      if (error) throw error;

      if (isPaymentResponse(result)) {
        console.log('Payment created successfully:', result);
        setPaymentUrl(result.paymentUrl);
        setPaymentId(result.paymentId || null);
        setPaymentStatus('pending');
        setPollCount(0);
        
        // Sauvegarder la méthode si demandé et consentement donné
        if (saveMethod && !useSavedMethod) {
          addPaymentMethod({
            provider: paymentMethod,
            phoneNumber: phoneNumber,
            setAsDefault: paymentMethods.length === 0,
          });
        }

        if (result.paymentUrl) {
          toast({
            title: 'Paiement initié',
            description: 'Complétez le paiement dans la fenêtre qui vient de s\'ouvrir.',
          });

          // Ouvrir la page de paiement dans une nouvelle fenêtre
          const paymentWindow = window.open(
            result.paymentUrl,
            '_blank',
            'width=600,height=700,scrollbars=yes'
          );

          if (!paymentWindow) {
            toast({
              variant: "destructive",
              title: "Popup bloqué",
              description: "Veuillez autoriser les popups pour continuer le paiement.",
            });
            setIsProcessing(false);
            setPaymentStatus('idle');
            return;
          }

          // Monitor if window is closed
          const windowCheckInterval = setInterval(() => {
            if (paymentWindow.closed) {
              clearInterval(windowCheckInterval);
              if (paymentStatus === 'pending') {
                toast({
                  title: "Fenêtre fermée",
                  description: "Vérification du statut du paiement en cours...",
                });
              }
            }
          }, 1000);
        }
      } else {
        throw new Error('Invalid payment response');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setPaymentStatus('idle');
    setPaymentUrl(null);
    setPaymentId(null);
    setPollCount(0);
    setPhoneNumber('');
    setSaveMethod(false);
    setUseSavedMethod(false);
    setSelectedSavedMethod('');
    onOpenChange(false);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const renderPaymentStatus = () => {
    switch (paymentStatus) {
      case 'pending':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-semibold">Paiement en cours...</p>
            <p className="text-sm text-muted-foreground text-center">
              Veuillez confirmer le paiement sur votre téléphone via USSD/OTP
            </p>
            <p className="text-xs text-muted-foreground">
              Vérification {pollCount} / {Math.floor(MAX_POLL_TIME / POLL_INTERVAL)}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
            >
              Annuler
            </Button>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-lg font-semibold">Paiement initié avec succès!</p>
            <p className="text-sm text-muted-foreground text-center">
              Suivez les instructions sur votre téléphone pour finaliser le paiement
            </p>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <XCircle className="h-16 w-16 text-destructive" />
            <p className="text-lg font-semibold">Erreur de paiement</p>
            <p className="text-sm text-muted-foreground text-center">
              Une erreur s'est produite. Veuillez réessayer.
            </p>
            <Button onClick={() => setPaymentStatus('idle')} variant="outline">
              Réessayer
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payer le rendez-vous</DialogTitle>
          <DialogDescription>
            Montant à payer: {formatAmount(amount)}
          </DialogDescription>
        </DialogHeader>

        {paymentStatus !== 'idle' ? (
          renderPaymentStatus()
        ) : (
          <div className="space-y-4 py-4">
            {/* Méthodes sauvegardées */}
            {paymentMethods.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-saved"
                    checked={useSavedMethod}
                    onCheckedChange={(checked) => setUseSavedMethod(checked as boolean)}
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
                      <RadioGroupItem value="orange" id="orange" />
                      <Label htmlFor="orange" className="font-normal cursor-pointer">
                        {MOBILE_MONEY_PROVIDERS.orange.icon} {MOBILE_MONEY_PROVIDERS.orange.name}
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
                  <Label htmlFor="phone">Numéro de téléphone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Ex: +229 12345678"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
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
          </div>
        )}

        {paymentStatus === 'idle' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Annuler
            </Button>
            <Button onClick={handlePayment} disabled={isProcessing} className="flex-1">
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
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
