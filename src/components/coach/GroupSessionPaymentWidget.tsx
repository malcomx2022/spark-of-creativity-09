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
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunctionWithRetry } from '@/lib/edge-function-retry';
import { useSavedPaymentMethods } from '@/hooks/useSavedPaymentMethods';
import { MOBILE_MONEY_PROVIDERS, formatAmount } from '@/lib/payment-config';
import { normalizePhoneNumber } from '@/lib/phone-utils';
import { clearPersistedPaymentState } from '@/lib/payment-storage';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [saveMethod, setSaveMethod] = useState(false);
  const [fedapayConfig, setFedapayConfig] = useState<{ publicKey: string; environment: string } | null>(null);
  const [widgetInitialized, setWidgetInitialized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const { addPaymentMethod } = useSavedPaymentMethods();

  // Load FedaPay configuration
  useEffect(() => {
    const loadFedaPayConfig = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-fedapay-config');
        if (error) throw error;
        setFedapayConfig(data);
        
        // En mode sandbox, pré-remplir avec un numéro de test MTN
        if (data?.environment === 'sandbox' && !phoneNumber) {
          setPhoneNumber('+22966000001');
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
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', authSession.user.id)
          .single();
        
        if (profile) {
          if (profile.full_name) setPayerName(profile.full_name);
          if (profile.phone) setPhoneNumber(profile.phone);
        }
        
        if (authSession.user.email) {
          setPayerEmail(authSession.user.email);
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
      const { data: { session: authSession } } = await supabase.auth.getSession();

      if (!authSession) {
        throw new Error('Vous devez être connecté pour effectuer un paiement');
      }

      console.log('Creating group session registration and payment...', {
        sessionId: session.id,
        amount: session.price_per_person,
        paymentMethod
      });

      // Appeler register-group-session pour créer l'inscription ET le paiement
      const { data: result, error } = await invokeEdgeFunctionWithRetry(
        'register-group-session',
        {
          body: {
            sessionId: session.id,
            patientId: authSession.user.id,
            amount: session.price_per_person,
            paymentMethod,
            phoneNumber: sanitizedPhoneNumber,
            payerName: payerName.trim(),
            payerEmail: payerEmail.trim() || undefined,
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

      // Gérer les erreurs
      if (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'inscription';
        console.error('Registration/payment error:', errorMessage);
        
        // Parse l'erreur pour récupérer les détails
        let errorDetails: any = null;
        
        try {
          const jsonMatch = errorMessage.match(/\{[^}]*"error"[^}]*\}/);
          if (jsonMatch) {
            errorDetails = JSON.parse(jsonMatch[0]);
          }
          
          if (!errorDetails) {
            try {
              errorDetails = JSON.parse(errorMessage);
            } catch (e) {
              // Pas JSON valide
            }
          }
        } catch (parseError) {
          console.error('Could not parse error details:', parseError);
        }
        
        // Si c'est une erreur de doublon
        const isDuplicateError = errorMessage.includes('déjà inscrit') || errorMessage.includes('already registered');
        
        if (isDuplicateError) {
          setIsProcessing(false);
          setPaymentStatus('error');
          
          toast({
            title: 'Inscription existante',
            description: errorDetails?.error || 'Vous êtes déjà inscrit à cette séance.',
            variant: 'destructive',
            duration: 10000,
          });
          return;
        }
        
        throw new Error(errorMessage);
      }

      // Vérifier que nous avons reçu le transactionId
      if (!result || typeof result !== 'object' || !('transactionId' in result)) {
        throw new Error('ID de transaction non reçu du serveur. Veuillez réessayer.');
      }

      const txId = parseInt(String((result as any).transactionId));
      setTransactionId(txId);

      console.log('Registration and payment transaction created successfully:', {
        transactionId: txId,
        participantId: (result as any).participantId,
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
    
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    
    clearPersistedPaymentState();
  };

  const handleClose = () => {
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
      
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      
      if (typeof window !== 'undefined' && (window as any).FedaPay) {
        try {
          const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);
          const phoneForFedaPay = sanitizedPhoneNumber ? sanitizedPhoneNumber.replace(/^\+229/, '') : '';
          
          const widget = (window as any).FedaPay.init({
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
            onComplete: async (data: any) => {
              console.log('FedaPay onComplete:', data);
              
              const isSuccess = data.reason === "CHECKOUT COMPLETE" || 
                               data.reason === 1 || 
                               data.transaction?.status === "approved";
              
              if (isSuccess) {
                console.log('Payment completed successfully');
                setPaymentStatus('success');
                setIsProcessing(false);
                
                clearPersistedPaymentState();
                
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
  }, [paymentStatus, transactionId, fedapayConfig, widgetInitialized, phoneNumber, payerName, payerEmail, session]);

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

        {paymentStatus === 'idle' && (
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
