import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { PaymentMetrics } from './PaymentMetrics';
import { RecentPaymentsTable } from './RecentPaymentsTable';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export function PaymentsMonitoring() {
  const { toast } = useToast();
  const [isReconciling, setIsReconciling] = useState(false);

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-payments');
      
      if (error) throw error;

      toast({
        title: 'Réconciliation lancée',
        description: `${data.reconciled} paiement(s) corrigé(s) sur ${data.total_checked} vérifiés`,
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
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
