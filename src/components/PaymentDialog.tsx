import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, ShieldCheck, ExternalLink, ReceiptText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSavedPaymentMethods } from '@/hooks/useSavedPaymentMethods';
import { MOBILE_MONEY_PROVIDERS } from '@/lib/payment-config';

type PaymentMethod = 'mtn' | 'orange' | 'moov';

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
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [saveMethod, setSaveMethod] = useState(false);
  const [useSavedMethod, setUseSavedMethod] = useState(false);
  const [selectedSavedMethod, setSelectedSavedMethod] = useState<string>('');
  const [autoPrefilled, setAutoPrefilled] = useState(false);
  
  const { paymentMethods, addPaymentMethod, getDecryptedPhone } = useSavedPaymentMethods();

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

    setPaymentMethod(method.provider);

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
    // Si une méthode sauvegardée est sélectionnée, l'utiliser
    let resolvedPhoneNumber = phoneNumber;

    if (useSavedMethod && selectedSavedMethod) {
      const method = paymentMethods.find((m) => m.id === selectedSavedMethod);
      if (method) {
        try {
          const decrypted = await getDecryptedPhone(method.id);
          resolvedPhoneNumber = decrypted;
          setPaymentMethod(method.provider);
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

    if (!sanitizedPhoneNumber) {
      toast({
        title: 'Erreur',
        description: 'Numéro de téléphone invalide. Format attendu: +229 XXXXXXXX',
        variant: 'destructive',
      });
      return;
    }

    if (!supabase) {
      toast({
        title: 'Erreur de configuration',
        description: "Le client Supabase n'est pas initialisé.",
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

      console.log('Initiating payment:', { appointmentId, amount, paymentMethod });

      const { data: result, error } = await supabase.functions.invoke('create-payment', {
        body: {
          appointmentId,
          amount,
          paymentMethod,
          phoneNumber: sanitizedPhoneNumber,
        },
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }

      console.log('Payment response received:', result);

      if (isPaymentResponse(result)) {
        // Vérifier si une erreur est retournée
        if (result.error) {
          throw new Error(result.error);
        }

        // Vérifier que nous avons une URL de paiement
        if (!result.paymentUrl) {
          throw new Error('URL de paiement non reçue du serveur');
        }

        setPaymentUrl(result.paymentUrl);
        setPaymentId(result.paymentId || null);
        setTransactionId(result.transactionId || null);
        setExpiresAt(result.expiresAt || null);
        setPaymentStatus('pending');
        setPollCount(0);

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

        toast({
          title: 'Paiement initié',
          description: result.message || 'Complétez le paiement dans la fenêtre qui vient de s\'ouvrir.',
        });

        // Ouvrir la page de paiement dans une nouvelle fenêtre
        const paymentWindow = window.open(
          result.paymentUrl,
          '_blank',
          'width=600,height=700,scrollbars=yes,location=yes'
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
      } else {
        throw new Error('Format de réponse invalide du serveur');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setPaymentStatus('error');
      setIsProcessing(false);
      
      const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement';
      
      toast({
        title: 'Erreur de paiement',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const resetPaymentState = useCallback(() => {
    setPaymentStatus('idle');
    setPaymentUrl(null);
    setPaymentId(null);
    setTransactionId(null);
    setExpiresAt(null);
    setPollCount(0);
    setPhoneNumber('');
    setSaveMethod(false);
    setUseSavedMethod(false);
    setSelectedSavedMethod('');
    setAutoPrefilled(false);
  }, []);

  const closeDialog = useCallback(() => {
    resetPaymentState();
    onOpenChange(false);
  }, [onOpenChange, resetPaymentState]);

  // Poll payment status
  useEffect(() => {
    if (!paymentId || paymentStatus !== 'pending') return;

    const startTime = Date.now();
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
            closeDialog();
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

    const pollInterval = setInterval(checkPaymentStatus, POLL_INTERVAL);

    return () => {
      clearInterval(pollInterval);
    };
  }, [paymentId, paymentStatus, onSuccess, closeDialog]);

  const handleDialogOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      resetPaymentState();
    }
    onOpenChange(isOpen);
  }, [onOpenChange, resetPaymentState]);

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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Paiement sécurisé via FedaPay</AlertTitle>
              <AlertDescription>
                Vos informations sont chiffrées et traitées par la passerelle régionale FedaPay. Vous serez redirigé vers une page sécurisée pour autoriser le paiement mobile money.
              </AlertDescription>
            </Alert>

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

        {paymentStatus === 'idle' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeDialog} className="flex-1">
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
