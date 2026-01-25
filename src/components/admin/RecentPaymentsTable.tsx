import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink } from 'lucide-react';

export function RecentPaymentsTable() {
  const { data: payments } = useQuery({
    queryKey: ['recent-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    refetchInterval: 10000 // Refresh toutes les 10s
  });

  const statusColors: Record<string, string> = {
    paid: 'bg-green-500',
    pending: 'bg-orange-500',
    initiated: 'bg-blue-500',
    failed: 'bg-red-500',
    canceled: 'bg-gray-500'
  };

  const getRowColor = (payment: any) => {
    const age = Date.now() - new Date(payment.created_at).getTime();
    const tenMinutes = 10 * 60 * 1000;
    
    if (payment.status === 'failed') return 'bg-red-50';
    if ((payment.status === 'pending' || payment.status === 'initiated') && age > tenMinutes) {
      return 'bg-orange-50';
    }
    return '';
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Montant</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Méthode</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Âge</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments?.map(payment => {
          const age = Math.floor((Date.now() - new Date(payment.created_at).getTime()) / 60000);
          
          return (
            <TableRow key={payment.id} className={getRowColor(payment)}>
              <TableCell className="font-mono text-xs">
                {payment.id.slice(0, 8)}...
              </TableCell>
              <TableCell className="font-semibold">
                {payment.amount.toLocaleString()} {payment.currency}
              </TableCell>
              <TableCell>
                <Badge className={statusColors[payment.status] || 'bg-gray-500'}>
                  {payment.status}
                </Badge>
              </TableCell>
              <TableCell>{payment.payment_method}</TableCell>
              <TableCell className="text-xs">
                {format(new Date(payment.created_at), 'dd/MM HH:mm', { locale: fr })}
              </TableCell>
              <TableCell className={age > 10 ? 'text-orange-600 font-semibold' : ''}>
                {age} min
              </TableCell>
              <TableCell>
                {/* P3: Add noreferrer and aria-label for accessibility */}
                {payment.fedapay_payment_url && (
                  <Button size="sm" variant="ghost" asChild title="Voir sur FedaPay">
                    <a
                      href={payment.fedapay_payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Ouvrir le paiement sur FedaPay"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
