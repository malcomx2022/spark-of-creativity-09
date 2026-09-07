import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface CallbackPayment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  appointment_id: string | null;
  fedapay_transaction_id: string | null;
}

/**
 * Retrouve le paiement visé par le retour FedaPay : par identifiant, par rendez-vous
 * (dernier paiement) ou par transaction FedaPay (recherche dans les paiements de l'utilisateur).
 */
async function findCallbackPayment(params: { transactionId: string | null; paymentId: string | null; appointmentId: string | null }): Promise<CallbackPayment | null> {
  if (params.paymentId) {
    return api.get<CallbackPayment>(`/payments/${params.paymentId}`);
  }
  if (params.appointmentId) {
    const rows = await api.get<CallbackPayment[]>('/payments', { query: { appointmentId: params.appointmentId, limit: 1 } });
    return rows[0] ?? null;
  }
  const rows = await api.get<CallbackPayment[]>('/payments', { query: { limit: 200 } });
  return rows.find((p) => p.fedapay_transaction_id === params.transactionId) ?? null;
}

/**
 * Page de callback après un paiement FedaPay
 * FedaPay redirige vers cette page avec des paramètres de query
 */
export default function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [paymentDetails, setPaymentDetails] = useState<CallbackPayment | null>(null);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      try {
        // Récupérer les paramètres de FedaPay
        const transactionId = searchParams.get('transaction_id');
        const paymentId = searchParams.get('payment_id');
        const appointmentId = searchParams.get('appointment_id');
        
        console.log('Payment callback received:', { transactionId, paymentId, appointmentId });

        if (!transactionId && !paymentId && !appointmentId) {
          throw new Error('Paramètres de paiement manquants');
        }

        // Attendre quelques secondes pour que le webhook ait le temps de traiter
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Récupérer le statut du paiement depuis l'API
        let payment: CallbackPayment | null = null;
        try {
          payment = await findCallbackPayment({ transactionId, paymentId, appointmentId });
        } catch (lookupError) {
          console.error('Payment not found:', lookupError);
        }

        if (!payment) {
          throw new Error('Paiement non trouvé');
        }

        setPaymentDetails(payment);

        // Déterminer le statut final
        if (payment.status === 'paid') {
          setStatus('success');
          toast({
            title: 'Paiement confirmé',
            description: 'Votre paiement a été traité avec succès',
          });
        } else if (['failed', 'canceled'].includes(payment.status)) {
          setStatus('error');
          toast({
            title: 'Paiement échoué',
            description: 'Le paiement n\'a pas pu être finalisé',
            variant: 'destructive',
          });
        } else {
          // Encore en attente : demander une resynchronisation avec FedaPay puis relire
          console.log('Payment still processing, syncing with FedaPay...');
          try {
            await api.post(`/payments/${payment.id}/sync`);
          } catch (syncError) {
            console.warn('Payment sync failed, retrying after delay:', syncError);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

          const updatedPayment = await api.get<CallbackPayment>(`/payments/${payment.id}`);
          setPaymentDetails(updatedPayment);
          setStatus(updatedPayment.status === 'paid' ? 'success' : 'error');
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
        setStatus('error');
        toast({
          title: 'Erreur',
          description: 'Impossible de vérifier le statut du paiement',
          variant: 'destructive',
        });
      }
    };

    checkPaymentStatus();
  }, [searchParams]);

  const handleContinue = () => {
    navigate('/dashboard/patient');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'loading' && (
            <>
              <div className="mx-auto mb-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
              </div>
              <CardTitle>Vérification du paiement</CardTitle>
              <CardDescription>
                Veuillez patienter pendant que nous vérifions votre paiement...
              </CardDescription>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div className="mx-auto mb-4">
                <CheckCircle2 className="h-16 w-16 text-success" />
              </div>
              <CardTitle>Paiement confirmé !</CardTitle>
              <CardDescription>
                Votre paiement de {paymentDetails?.amount} {paymentDetails?.currency} a été traité avec succès
              </CardDescription>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="mx-auto mb-4">
                <XCircle className="h-16 w-16 text-destructive" />
              </div>
              <CardTitle>Paiement non confirmé</CardTitle>
              <CardDescription>
                Le paiement n'a pas pu être finalisé. Veuillez réessayer.
              </CardDescription>
            </>
          )}
        </CardHeader>
        
        <CardContent className="space-y-4">
          {paymentDetails && (
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID Transaction:</span>
                <span className="font-mono">{paymentDetails.fedapay_transaction_id || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut:</span>
                <span className="font-semibold">{paymentDetails.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant:</span>
                <span className="font-semibold">{paymentDetails.amount} {paymentDetails.currency}</span>
              </div>
            </div>
          )}

          {status !== 'loading' && (
            <Button onClick={handleContinue} className="w-full">
              Retour au tableau de bord
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
