import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { PaymentMetrics } from './PaymentMetrics';
import { RecentPaymentsTable } from './RecentPaymentsTable';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface ReconciliationResult {
  report_id: string;
  summary: { total_db_payments: number; matched_count: number; anomalies_count: number };
}

export function PaymentsMonitoring() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isReconciling, setIsReconciling] = useState(false);

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      // Réconciliation FedaPay ↔ base sur les 7 derniers jours (ex reconcile-payments).
      const data = await api.post<ReconciliationResult>('/admin/finance/reconciliation', {}, { timeoutMs: 120_000 });

      toast({
        title: 'Réconciliation terminée',
        description: `${data.summary.anomalies_count} anomalie(s) détectée(s) sur ${data.summary.total_db_payments} paiement(s) vérifié(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ['recent-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-reports'] });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de lancer la réconciliation'),
        variant: 'destructive'
      });
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Monitoring des Paiements</h2>
        <Button onClick={handleReconcile} disabled={isReconciling}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
          Réconcilier maintenant
        </Button>
      </div>

      <PaymentMetrics />

      <Card>
        <CardHeader>
          <CardTitle>20 Derniers Paiements</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentPaymentsTable />
        </CardContent>
      </Card>
    </div>
  );
}
