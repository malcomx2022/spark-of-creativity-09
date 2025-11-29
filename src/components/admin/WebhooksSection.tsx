import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export function WebhooksSection() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: webhooks = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const stats = {
    total: webhooks.length,
    processed: webhooks.filter(w => w.processing_status === 'success').length,
    pending: webhooks.filter(w => w.processing_status === 'pending' || w.processing_status === 'processing').length,
    failed: webhooks.filter(w => w.processing_status === 'failed').length,
    permanentlyFailed: webhooks.filter(w => w.processing_status === 'permanently_failed').length,
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return 'default';
      case 'processing':
        return 'secondary';
      case 'failed':
        return 'destructive';
      case 'permanently_failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const handleExport = () => {
    const csv = [
      ['ID', 'Event ID', 'Event Type', 'Processed', 'Date', 'Payload'].join(','),
      ...webhooks.map(w => [
        w.id,
        w.event_id,
        w.event_type,
        w.processed_at ? 'Oui' : 'Non',
        new Date(w.created_at || '').toISOString(),
        JSON.stringify(w.payload),
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webhooks-${new Date().toISOString()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total webhooks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Traités
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.processed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              En attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Échoués
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.failed + stats.permanentlyFailed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Événements Webhook</CardTitle>
              <CardDescription>Historique des webhooks reçus de FedaPay</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto-refresh
              </Button>
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
          ) : webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun webhook reçu
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Event ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Retry</TableHead>
                    <TableHead>Dernière tentative</TableHead>
                    <TableHead>Erreur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {webhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(webhook.created_at || '').toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {webhook.event_id}
                        </TableCell>
                        <TableCell className="font-medium">{webhook.event_type}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(webhook.processing_status)}>
                            {webhook.processing_status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {webhook.retry_count > 0 ? `${webhook.retry_count}/5` : '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {webhook.last_retry_at
                            ? new Date(webhook.last_retry_at).toLocaleString('fr-FR')
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-destructive">
                          {webhook.error_message || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
