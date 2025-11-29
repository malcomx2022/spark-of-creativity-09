import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export function PaymentMetrics() {
  const { data: metrics } = useQuery({
    queryKey: ['payment-metrics'],
    queryFn: async () => {
      // Métriques pour les dernières 24h
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: payments, error } = await supabase
        .from('payments')
        .select('status, amount, created_at')
        .gte('created_at', oneDayAgo);

      if (error) throw error;

      const total = payments.length;
      const paid = payments.filter(p => p.status === 'paid').length;
      const pending = payments.filter(p => p.status === 'pending' || p.status === 'initiated').length;
      const failed = payments.filter(p => p.status === 'failed').length;
      
      const totalAmount = payments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0);

      const pendingAmount = payments
        .filter(p => p.status === 'pending' || p.status === 'initiated')
        .reduce((sum, p) => sum + p.amount, 0);

      const successRate = total > 0 ? (paid / total) * 100 : 0;

      // Temps moyen de confirmation (approximation)
      const paidPayments = payments.filter(p => p.status === 'paid');
      const avgConfirmTime = paidPayments.length > 0
        ? paidPayments.reduce((sum) => {
            // Approximation: on suppose 5 min en moyenne
            return sum + 5;
          }, 0) / paidPayments.length
        : 0;

      return {
        total,
        paid,
        pending,
        failed,
        totalAmount,
        pendingAmount,
        successRate,
        avgConfirmTime
      };
    },
    refetchInterval: 10000 // Refresh toutes les 10s
  });

  const metricCards = [
    {
      title: 'Paiements payés (24h)',
      value: metrics?.paid || 0,
      icon: CheckCircle,
      color: 'text-green-600',
      subtext: `${metrics?.totalAmount?.toLocaleString() || 0} FCFA`
    },
    {
      title: 'En attente',
      value: metrics?.pending || 0,
      icon: Clock,
      color: 'text-orange-600',
      subtext: `${metrics?.pendingAmount?.toLocaleString() || 0} FCFA`,
      alert: (metrics?.pendingAmount || 0) > 50000
    },
    {
      title: 'Taux de succès',
      value: `${metrics?.successRate?.toFixed(1) || 0}%`,
      icon: TrendingUp,
      color: 'text-blue-600',
      subtext: `${metrics?.total || 0} tentatives`,
      alert: (metrics?.successRate || 100) < 95
    },
    {
      title: 'Échecs',
      value: metrics?.failed || 0,
      icon: AlertCircle,
      color: 'text-red-600',
      subtext: 'dernières 24h',
      alert: (metrics?.failed || 0) > (metrics?.total || 1) * 0.05
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metricCards.map((metric, index) => (
        <Card key={index} className={metric.alert ? 'border-red-500 border-2' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {metric.title}
            </CardTitle>
            <metric.icon className={`h-4 w-4 ${metric.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metric.color}`}>
              {metric.value}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metric.subtext}
            </p>
            {metric.alert && (
              <p className="text-xs text-red-600 mt-2">⚠️ Attention requise</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
