import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Calendar, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api, auth } from '@/lib/api';
import { useRetryGroupSessionPayment } from '@/hooks/useRetryGroupSessionPayment';
import { MOBILE_MONEY_PROVIDERS, formatAmount } from '@/lib/payment-config';
import { normalizePhoneNumber } from '@/lib/phone-utils';
import { clearPersistedPaymentState } from '@/lib/payment-storage';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type PaymentMethod = 'mtn' | 'moov';

interface RetryGroupSessionPaymentWidgetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId: string;
  session: {
    id: string;
    session_name: string;
    price_per_person: number;
    scheduled_date: string;
    start_time: string;
  };
  onSuccess?: () => void;
  onComplete?: () => void;
}

export function RetryGroupSessionPaymentWidget({ 
  open, 
  onOpenChange, 
  participantId,
  session, 
  onSuccess, 
  onComplete 
}: RetryGroupSessionPaymentWidgetProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [fedapayConfig, setFedapayConfig] = useState<{ publicKey: string; environment: string } | null>(null);
  const [widgetInitialized, setWidgetInitialized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const { retryPayment, isRetrying } = useRetryGroupSessionPayment();

  // Load FedaPay configuration
  useEffect(() => {
    const loadFedaPayConfig = async () => {
      try {
        const data = await api.get<{ publicKey: string | null; environment: string; provider?: string }>('/payments/config', { auth: false });
        setFedapayConfig(data);

        // ✅ Bug #1 FIX: NE PAS pré-remplir le numéro de test - même en sandbox
        // Les numéros de test sont documentés dans les logs console seulement
        if (data?.environment === 'sandbox') {
          console.log('🧪 MODE SANDBOX - Numéros de test disponibles:');
          console.log('   ✅ MTN succès: +229 66 00 00 01');
          console.log('   ✅ MOOV succès: +229 64 00 00 01');
          console.log('   ❌ Échec simulé: +229 66 00 00 00 ou +229 64 00 00 00');
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

  // Load user profile data
  useEffect(() => {
    const loadUserProfile = async () => {
      if (auth.getUser()) {
        const profile = await api.get<{ full_name?: string | null; phone?: string | null }>('/profile').catch(() => null);

        if (profile) {
          if (profile.full_name) setPayerName(profile.full_name);
          if (profile.phone) setPhoneNumber(profile.phone);
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
        description: 'Configuration de paiement non disponible.',
        variant: 'destructive',
      });
      return;
    }

    const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!sanitizedPhoneNumber) {
      toast({
        title: 'Erreur',
        description: 'Numéro de téléphone invalide.',
        variant: 'destructive',
      });
      return;
    }

    setPaymentStatus('pending');

    try {
      const result = await retryPayment({
        participantId,
        paymentMethod,
        phoneNumber: sanitizedPhoneNumber,
      });

      if (!result.transactionId) {
        throw new Error('ID de transaction non reçu du serveur.');
      }

      const txId = parseInt(String(result.transactionId));
      setTransactionId(txId);

      console.log('Retry payment transaction created:', txId);
      
    } catch (error) {
      console.error('Retry payment error:', error);
      setPaymentStatus('error');
      clearPersistedPaymentState();
    }
  };

  const resetState = () => {
    setPaymentStatus('idle');
    setTransactionId(null);
    setWidgetInitialized(false);
    
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    
    clearPersistedPaymentState();
  };

  const handleClose = () => {
    if (paymentStatus === 'pending' && transactionId) {
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

  // Initialize FedaPay widget
  useEffect(() => {
    if (paymentStatus === 'pending' && transactionId && fedapayConfig && containerRef.current && !widgetInitialized) {
      console.log('Initializing FedaPay widget for retry:', transactionId);
      
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      
      if (typeof window !== 'undefined' && (window as any).FedaPay) {
        try {
          const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);
          const phoneForFedaPay = sanitizedPhoneNumber ? sanitizedPhoneNumber.replace(/^\+229/, '') : '';
          
          (window as any).FedaPay.init({
            public_key: fedapayConfig.publicKey,
            transaction: {
              id: transactionId,
              amount: session.price_per_person,
              description: `Inscription séance: ${session.session_name}`,
            },
            customer: {
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
            container: '#fedapay-retry-container',
            onComplete: async (data: any) => {
              console.log('FedaPay onComplete:', data);
              
              const isSuccess = data.reason === "CHECKOUT COMPLETE" || 
                               data.reason === 1 || 
                               data.transaction?.status === "approved";
              
              if (isSuccess) {
                setPaymentStatus('success');
                
                await new Promise(resolve => setTimeout(resolve, 1500));
                await queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
                await queryClient.invalidateQueries({ queryKey: ['patient-group-sessions'] });
                
                toast({
                  title: '✅ Paiement confirmé',
                  description: `Votre inscription à "${session.session_name}" est confirmée`,
                  duration: 5000,
                });
                
                if (onSuccess) onSuccess();
                if (onComplete) onComplete();
                
                setTimeout(() => {
                  resetState();
                  onOpenChange(false);
                }, 3000);
              } else if (data.reason === 2 || data.reason === "DIALOG_DISMISSED") {
                setPaymentStatus('error');
                toast({
                  title: '❌ Paiement annulé',
                  description: 'Vous avez fermé la fenêtre de paiement',
                  variant: 'destructive',
                });
              }
            },
          });
          
          setWidgetInitialized(true);
        } catch (error) {
          console.error('Error initializing FedaPay widget:', error);
          setPaymentStatus('error');
        }
      }
    }
  }, [paymentStatus, transactionId, fedapayConfig, widgetInitialized, phoneNumber, payerName, session]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finaliser le paiement</DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{session.session_name}</span> - {formatAmount(session.price_per_person)}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary" />
            <span>{format(new Date(session.scheduled_date), 'EEEE d MMMM yyyy', { locale: fr })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            <span>{session.start_time}</span>
          </div>
        </div>

        {fedapayConfig?.environment === 'sandbox' && (
          <Alert className="border-primary/50 bg-primary/5">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              <p className="font-semibold mb-2">Mode Test</p>
              <ul className="space-y-1 text-xs">
                <li>✅ MTN succès: +229 66 00 00 01</li>
                <li>✅ MOOV succès: +229 64 00 00 01</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {paymentStatus === 'success' && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Paiement confirmé ! Votre inscription est validée.
            </AlertDescription>
          </Alert>
        )}

        {paymentStatus === 'error' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Le paiement a échoué. Veuillez réessayer.
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
                      <RadioGroupItem value={id} id={`retry-${id}`} />
                      <Label htmlFor={`retry-${id}`} className="flex items-center gap-3 cursor-pointer flex-1">
                        <span className="text-2xl">{provider.icon}</span>
                        <span className="font-medium">{provider.name}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="retryPhone">Numéro de téléphone *</Label>
                <PhoneInput
                  id="retryPhone"
                  value={phoneNumber}
                  onChange={(value) => setPhoneNumber(value)}
                  countryCode="+229"
                  localNumberLength={8}
                  disabled={isRetrying}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isRetrying} className="flex-1">
                Annuler
              </Button>
              <Button type="submit" disabled={isRetrying || !phoneNumber} className="flex-1">
                {isRetrying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Traitement...
                  </>
                ) : (
                  `Payer ${formatAmount(session.price_per_person)}`
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
              </AlertDescription>
            </Alert>
            
            <div 
              id="fedapay-retry-container" 
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
