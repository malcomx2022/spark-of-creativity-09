import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Play, RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function FundsReleaseSection() {
  const [lastRunResult, setLastRunResult] = useState<any>(null);

  const { data: heldPayments = [], isLoading, refetch } = useQuery({
    queryKey: ['held-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          net_amount,
          hold_until,
          created_at,
          appointment_id,
          appointments!inner(practitioner_id, practitioner_name)
        `)
        .eq('payout_status', 'held')
        .eq('status', 'paid')
        .order('hold_until', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('release-held-funds', {
        body: { manual_trigger: true },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setLastRunResult(data);
      toast.success(
        `Release terminé: ${data.results?.released || 0} paiements libérés, ${data.results?.failed || 0} échecs`
      );
      refetch();
    },
    onError: (error: any) => {
      console.error('Error releasing funds:', error);
      toast.error('Erreur lors du release des fonds');
    },
  });

  const now = new Date();
  const readyToRelease = heldPayments.filter(
    (p) => p.hold_until && new Date(p.hold_until) <= now
  );
  const stillHeld = heldPayments.filter(
    (p) => p.hold_until && new Date(p.hold_until) > now
  );

  const totalHeldAmount = heldPayments.reduce(
    (sum, p) => sum + (p.net_amount || p.amount),
    0
  );
  const readyAmount = readyToRelease.reduce(
    (sum, p) => sum + (p.net_amount || p.amount),
    0
  );

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total en rétention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHeldAmount.toLocaleString()} XOF</div>
            <p className="text-xs text-muted-foreground mt-1">{heldPayments.length} paiements</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prêt à libérer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{readyAmount.toLocaleString()} XOF</div>
            <p className="text-xs text-muted-foreground mt-1">{readyToRelease.length} paiements</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Encore bloqué
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">
              {(totalHeldAmount - readyAmount).toLocaleString()} XOF
            </div>
            <p className="text-xs text-muted-foreground mt-1">{stillHeld.length} paiements</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dernier release
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastRunResult ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  <span className="text-xl font-bold">{lastRunResult.results?.released || 0}</span>
                </div>
                {lastRunResult.results?.failed > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">{lastRunResult.results.failed} échecs</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Aucun release manuel</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Release automatique des fonds</CardTitle>
              <CardDescription>
                Les fonds sont automatiquement libérés toutes les heures après expiration de la période de hold
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
              <Button
                size="sm"
                onClick={() => releaseMutation.mutate()}
                disabled={releaseMutation.isPending || readyToRelease.length === 0}
              >
                {releaseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Libérer manuellement ({readyToRelease.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : heldPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun fonds en rétention
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date création</TableHead>
                    <TableHead>Payment ID</TableHead>
                    <TableHead>Praticien</TableHead>
                    <TableHead>Montant net</TableHead>
                    <TableHead>Hold jusqu'à</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Temps restant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heldPayments.map((payment: any) => {
                    const holdUntil = payment.hold_until ? new Date(payment.hold_until) : null;
                    const isReady = holdUntil && holdUntil <= now;
                    const timeRemaining = holdUntil
                      ? Math.max(0, Math.floor((holdUntil.getTime() - now.getTime()) / 1000 / 60 / 60))
                      : 0;

                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(payment.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {payment.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>{payment.appointments?.practitioner_name || 'N/A'}</TableCell>
                        <TableCell className="font-medium">
                          {(payment.net_amount || payment.amount).toLocaleString()} XOF
                        </TableCell>
                        <TableCell className="text-sm">
                          {holdUntil ? holdUntil.toLocaleString('fr-FR') : '-'}
                        </TableCell>
                        <TableCell>
                          {isReady ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Prêt
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" />
                              En attente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isReady ? (
                            <span className="text-sm text-primary font-medium">
                              Peut être libéré
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {timeRemaining}h restantes
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {lastRunResult && lastRunResult.results?.errors?.length > 0 && (
            <div className="mt-4 p-4 bg-destructive/10 rounded-lg">
              <h4 className="font-semibold text-destructive mb-2">Erreurs du dernier release:</h4>
              <div className="space-y-2">
                {lastRunResult.results.errors.map((error: any, index: number) => (
                  <div key={index} className="text-sm">
                    <span className="font-mono">{error.payment_id?.slice(0, 8)}...</span>:{' '}
                    <span className="text-destructive">{error.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">ℹ️ Informations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <strong>Cron automatique:</strong> La fonction s'exécute automatiquement toutes les heures (à minute 0).
          </p>
          <p>
            <strong>Période de hold:</strong> Par défaut 48h après le paiement (configurable dans create-payment).
          </p>
          <p>
            <strong>Processus:</strong> Les fonds passent de <code>balance_on_hold</code> à{' '}
            <code>balance_available</code> dans practitioner_balances.
          </p>
          <p>
            <strong>Statut paiement:</strong> Passe de <code>held</code> à <code>ready</code> une fois libéré.
          </p>
          <p>
            <strong>Gestion d'erreurs:</strong> En cas d'échec, l'opération est rollback et l'erreur est loguée.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
