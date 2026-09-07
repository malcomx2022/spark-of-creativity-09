import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw } from 'lucide-react';

interface PaymentEvent {
  id: string;
  payment_id: string;
  event_type: string;
  event_data: unknown;
  created_at: string | null;
}

export function PaymentEventsSection() {
  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-payment-events'],
    queryFn: () => api.get<PaymentEvent[]>('/admin/finance/payment-events', { query: { limit: 100 } }),
  });

  const getEventStatus = (eventData: unknown) => {
    try {
      const data = typeof eventData === 'string' ? JSON.parse(eventData) : eventData;
      return data?.new_status || data?.status || 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const stats = {
    total: events.length,
    initiated: events.filter(e => getEventStatus(e.event_data) === 'initiated').length,
    paid: events.filter(e => ['paid', 'completed'].includes(getEventStatus(e.event_data))).length,
    failed: events.filter(e => getEventStatus(e.event_data) === 'failed').length,
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      initiated: 'secondary',
      pending: 'secondary',
      paid: 'default',
      completed: 'default',
      failed: 'destructive',
      canceled: 'outline',
      refunded: 'outline',
    };
    return variants[status] || 'outline';
  };

  const handleExport = () => {
    const csv = [
      ['ID', 'Payment ID', 'Event Type', 'Date', 'Event Data'].join(','),
      ...events.map(e => [
        e.id,
        e.payment_id,
        e.event_type,
        new Date(e.created_at || '').toISOString(),
        JSON.stringify(e.event_data),
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-events-${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total événements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Initialisés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{stats.initiated}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.paid}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Échoués
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Événements de Paiement</CardTitle>
              <CardDescription>Historique des changements d'état des paiements</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualiser
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun événement de paiement
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Payment ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Event Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const eventStatus = getEventStatus(event.event_data);
                    return (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(event.created_at || '').toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.payment_id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{event.event_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(eventStatus)}>
                            {eventStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs">
                          <code className="text-xs">{JSON.stringify(event.event_data).substring(0, 100)}...</code>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
