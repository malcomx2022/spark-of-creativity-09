import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { classifyPaymentStatus, paymentStatusLabel, resolveCallbackParams, type CallbackParams } from '@/lib/payment-callback';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Clock, RefreshCw } from 'lucide-react';
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
 * Retrouve le paiement visé par le retour FedaPay : par identifiant (chemin de l'URL), par
 * rendez-vous (dernier paiement, URL historique) ou par transaction FedaPay.
 */
async function findCallbackPayment(params: CallbackParams): Promise<CallbackPayment | null> {
  if (params.paymentId) {
    return api.get<CallbackPayment>(`/payments/${params.paymentId}`);
  }
  if (params.appointmentId) {
    const rows = await api.get<CallbackPayment[]>('/payments', { query: { appointmentId: params.appointmentId, limit: 1 } });
    return rows[0] ?? null;
  }
  if (params.transactionId) {
    const rows = await api.get<CallbackPayment[]>('/payments', { query: { limit: 200 } });
    return rows.find((p) => p.fedapay_transaction_id === params.transactionId) ?? null;
  }
  return null;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface PaymentCallbackProps {
  /** Laisse au webhook FedaPay le temps d'arriver avant la première lecture. */
  initialDelayMs?: number;
  /** Intervalle entre deux relectures du paiement tant qu'il est en cours. */
  pollIntervalMs?: number;
  /** Durée au-delà de laquelle la page cesse de relire seule (le paiement reste « en attente », jamais « échoué »). */
  maxWaitMs?: number;
}

type Status = 'loading' | 'pending' | 'success' | 'error' | 'missing';

/**
 * Page de retour après un paiement FedaPay (`/payment/callback/:paymentId`, FedaPay y ajoute
 * `?id=&status=`). Le serveur fait foi : un paiement Mobile Money peut rester en cours plusieurs
 * minutes, la page attend et relit (resynchronisation toutes les 30 s) au lieu d'afficher un échec
 * qui pousserait le patient à repayer (M9).
 */
export default function PaymentCallback({ initialDelayMs = 2000, pollIntervalMs = 5000, maxWaitMs = 180_000 }: PaymentCallbackProps = {}) {
  const { paymentId: routePaymentId } = useParams<{ paymentId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [payment, setPayment] = useState<CallbackPayment | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [checking, setChecking] = useState(false);
  const paymentRef = useRef<CallbackPayment | null>(null);
  const syncsSinceLast = useRef(0);

  const params = useMemo(() => resolveCallbackParams(routePaymentId, searchParams), [routePaymentId, searchParams]);

  /** Applique un paiement relu ; renvoie vrai quand son état est définitif. */
  const settle = useCallback((p: CallbackPayment): boolean => {
    paymentRef.current = p;
    setPayment(p);
    const outcome = classifyPaymentStatus(p.status);
    if (outcome === 'paid') {
      setStatus('success');
      toast({ title: 'Paiement confirmé', description: 'Votre paiement a été traité avec succès' });
      return true;
    }
    if (outcome === 'closed') {
      setStatus('error');
      toast({ title: 'Paiement non confirmé', description: 'Le paiement a été refusé ou annulé', variant: 'destructive' });
      return true;
    }
    setStatus('pending');
    return false;
  }, []);

  /** Relecture du paiement en cours, avec resynchronisation FedaPay à la première lecture puis toutes les six. */
  const refresh = useCallback(async (forceSync: boolean): Promise<boolean> => {
    const current = paymentRef.current;
    if (!current) return false;
    if (forceSync || syncsSinceLast.current % 6 === 0) {
      await api.post(`/payments/${current.id}/sync`).catch((e) => console.warn('Payment sync failed:', e));
    }
    syncsSinceLast.current += 1;
    const fresh = await api.get<CallbackPayment>(`/payments/${current.id}`);
    return settle(fresh);
  }, [settle]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const poll = async () => {
      if (!active) return;
      try {
        if (await refresh(false)) return;
      } catch (e) {
        console.warn('Payment status check failed, retrying:', e);
      }
      if (!active) return;
      if (Date.now() - startedAt >= maxWaitMs) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, pollIntervalMs);
    };

    (async () => {
      if (!params.paymentId && !params.appointmentId && !params.transactionId) {
        setStatus('missing');
        return;
      }
      await delay(initialDelayMs);
      if (!active) return;
      let found: CallbackPayment | null = null;
      try {
        found = await findCallbackPayment(params);
      } catch (e) {
        console.error('Payment not found:', e);
      }
      if (!active) return;
      if (!found) {
        setStatus('missing');
        return;
      }
      if (settle(found)) return;
      // FedaPay annonce déjà un refus dans l'URL : resynchroniser tout de suite plutôt qu'attendre.
      if (params.fedapayStatus === 'declined' || params.fedapayStatus === 'canceled') syncsSinceLast.current = 0;
      await poll();
    })();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [params, initialDelayMs, pollIntervalMs, maxWaitMs, refresh, settle]);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      await refresh(true);
    } catch (e) {
      console.warn('Manual payment check failed:', e);
      toast({ title: 'Vérification impossible', description: 'Réessayez dans quelques instants', variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

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
              <CardDescription>Veuillez patienter pendant que nous vérifions votre paiement...</CardDescription>
            </>
          )}

          {status === 'pending' && !timedOut && (
            <>
              <div className="mx-auto mb-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
              </div>
              <CardTitle>Paiement en attente de confirmation</CardTitle>
              <CardDescription>
                Validez le paiement sur votre téléphone si ce n'est pas déjà fait. Cette page se met à jour automatiquement dès que
                FedaPay confirme la transaction.
              </CardDescription>
            </>
          )}

          {status === 'pending' && timedOut && (
            <>
              <div className="mx-auto mb-4">
                <Clock className="h-16 w-16 text-warning" />
              </div>
              <CardTitle>Toujours en attente</CardTitle>
              <CardDescription>
                Nous n'avons pas encore reçu la confirmation de FedaPay. Votre paiement n'est pas perdu : son statut sera mis à jour
                dès réception. Ne relancez pas un nouveau paiement ; vérifiez à nouveau ou retrouvez-le plus tard dans vos paiements.
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
                Votre paiement de {payment?.amount} {payment?.currency} a été traité avec succès
              </CardDescription>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto mb-4">
                <XCircle className="h-16 w-16 text-destructive" />
              </div>
              <CardTitle>Paiement non confirmé</CardTitle>
              <CardDescription>Le paiement a été refusé ou annulé. Vous pouvez réessayer depuis votre tableau de bord.</CardDescription>
            </>
          )}

          {status === 'missing' && (
            <>
              <div className="mx-auto mb-4">
                <XCircle className="h-16 w-16 text-destructive" />
              </div>
              <CardTitle>Paiement introuvable</CardTitle>
              <CardDescription>
                Nous n'avons pas retrouvé ce paiement. Si vous avez été débité, retrouvez-le dans vos paiements ou contactez le support.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {payment && (
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID Transaction:</span>
                <span className="font-mono">{payment.fedapay_transaction_id || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut:</span>
                <span className="font-semibold">{paymentStatusLabel(payment.status)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant:</span>
                <span className="font-semibold">
                  {payment.amount} {payment.currency}
                </span>
              </div>
            </div>
          )}

          {status === 'pending' && (
            <Button onClick={handleCheckNow} variant="outline" className="w-full" disabled={checking}>
              {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Vérifier maintenant
            </Button>
          )}

          {status !== 'loading' && (
            <Button onClick={handleContinue} className="w-full" variant={status === 'pending' ? 'secondary' : 'default'}>
              Retour au tableau de bord
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
