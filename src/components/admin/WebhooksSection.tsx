import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Download, RefreshCw, Filter, Eye, RotateCcw, CheckCircle, XCircle, Clock, AlertTriangle, Webhook } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from '@/hooks/use-toast';

// Labels français pour les statuts
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  processing: 'En cours',
  success: 'Succès',
  failed: 'Échoué',
  permanently_failed: 'Échec définitif',
};

/** Ligne de webhook_events renvoyée par GET /admin/finance/webhook-events. */
interface WebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  processing_status: string | null;
  retry_count: number | null;
  last_retry_at: string | null;
  error_message: string | null;
  created_at: string | null;
  processed_at: string | null;
}

interface WebhookEventsPage {
  data: WebhookEvent[];
  count: number;
  stats: { total: number; processed: number; pending: number; failed: number; permanently_failed: number };
  eventTypes: string[];
}

const STATUS_ICONS: Record<string, typeof Clock> = {
  success: CheckCircle,
  pending: Clock,
  processing: RefreshCw,
  failed: XCircle,
  permanently_failed: AlertTriangle,
};

// Labels français pour les types d'événements
const EVENT_TYPE_LABELS: Record<string, string> = {
  'transaction.approved': 'Transaction approuvée',
  'transaction.declined': 'Transaction refusée',
  'transaction.canceled': 'Transaction annulée',
  'transaction.created': 'Transaction créée',
  'payout.completed': 'Payout complété',
  'payout.failed': 'Payout échoué',
};

const getEventTypeLabel = (type: string): string => {
  return EVENT_TYPE_LABELS[type] || type;
};

export function WebhooksSection() {
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Filtres
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Dialog pour voir le payload
  const [viewingWebhook, setViewingWebhook] = useState<WebhookEvent | null>(null);

  // Filtres envoyés à l'API (liste et export)
  const webhookQuery = (pageIndex: number, pageLimit: number) => {
    const q: Record<string, string | number> = { page: pageIndex, limit: pageLimit };
    if (statusFilter !== 'all') q.status = statusFilter;
    if (eventTypeFilter !== 'all') q.eventType = eventTypeFilter;
    if (dateFrom) q.from = dateFrom;
    if (dateTo) q.to = dateTo;
    return q;
  };

  const { data: webhooksData, isLoading, refetch } = useQuery({
    queryKey: ['admin-webhooks', page, statusFilter, eventTypeFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get<WebhookEventsPage>('/admin/finance/webhook-events', { query: webhookQuery(page - 1, limit) });
      return { data: res.data, total: res.count, stats: res.stats, eventTypes: res.eventTypes };
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Types d'événements distincts (renvoyés avec la liste)
  const eventTypes = webhooksData?.eventTypes ?? [];

  const webhooks = webhooksData?.data || [];
  const totalCount = webhooksData?.total || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // Statistiques globales (indépendantes des filtres, calculées par l'API)
  const globalStats = webhooksData?.stats;
  const stats = globalStats
    ? { total: globalStats.total, processed: globalStats.processed, pending: globalStats.pending, failed: globalStats.failed, permanentlyFailed: globalStats.permanently_failed }
    : { total: 0, processed: 0, pending: 0, failed: 0, permanentlyFailed: 0 };

  // Mutation pour retry un webhook
  const retryWebhookMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      // L'API rejoue immédiatement l'événement et journalise l'action
      return api.post<{ eventId: string; status: 'success' | 'failed'; error?: string }>(`/admin/finance/webhook-events/${webhookId}/retry`, undefined, { timeoutMs: 60_000 });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] });
      if (result.status === 'success') {
        toast({ title: 'Webhook rejoué avec succès' });
      } else {
        toast({ title: 'Rejeu du webhook échoué', description: result.error, variant: 'destructive' });
      }
    },
    onError: (error: unknown) => {
      toast({ title: 'Erreur', description: errorMessage(error, 'Impossible de rejouer le webhook'), variant: 'destructive' });
    },
  });

  const getStatusBadge = (status: string | null): "default" | "secondary" | "outline" | "destructive" => {
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

  const resetFilters = () => {
    setStatusFilter('all');
    setEventTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleExport = async () => {
    try {
      // Récupérer tous les webhooks avec les filtres actuels (max 5000)
      const { data } = await api.get<WebhookEventsPage>('/admin/finance/webhook-events', { query: webhookQuery(0, 5000) });

      const escapeCSV = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

      const headers = ['Date', 'Event ID', 'Type', 'Statut', 'Retry', 'Dernière tentative', 'Erreur', 'Payload'];
      const rows = (data || []).map(w => [
        escapeCSV(new Date(w.created_at || '').toLocaleString('fr-FR')),
        escapeCSV(w.event_id),
        escapeCSV(getEventTypeLabel(w.event_type)),
        escapeCSV(STATUS_LABELS[w.processing_status] || w.processing_status || 'pending'),
        escapeCSV(w.retry_count > 0 ? `${w.retry_count}/5` : '0'),
        escapeCSV(w.last_retry_at ? new Date(w.last_retry_at).toLocaleString('fr-FR') : '-'),
        escapeCSV(w.error_message || '-'),
        escapeCSV(JSON.stringify(w.payload)),
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `webhooks_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Export réussi', description: `${data?.length || 0} webhooks exportés` });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible d\'exporter les webhooks', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Succès
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.processed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              En attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4 text-orange-600" />
              Échoués
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Échecs définitifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.permanentlyFailed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Événements Webhook
              </CardTitle>
              <CardDescription>Historique des webhooks reçus de FedaPay</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                Auto
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtres */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous types</SelectItem>
                  {eventTypes.map(type => (
                    <SelectItem key={type} value={type}>{getEventTypeLabel(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Du</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-[140px]"
              />
              <span className="text-sm text-muted-foreground">au</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-[140px]"
              />
            </div>
            {(statusFilter !== 'all' || eventTypeFilter !== 'all' || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Réinitialiser
              </Button>
            )}
          </div>
          {isLoading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {statusFilter !== 'all' || eventTypeFilter !== 'all' || dateFrom || dateTo
                ? 'Aucun webhook correspondant aux filtres'
                : 'Aucun webhook reçu'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Retry</TableHead>
                      <TableHead>Erreur</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map((webhook) => {
                      const StatusIcon = STATUS_ICONS[webhook.processing_status] || Clock;
                      return (
                        <TableRow key={webhook.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(webhook.created_at || '').toLocaleString('fr-FR')}
                          </TableCell>
                          <TableCell className="text-xs font-mono max-w-[150px] truncate">
                            {webhook.event_id}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{getEventTypeLabel(webhook.event_type)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadge(webhook.processing_status)} className="flex items-center gap-1 w-fit">
                              <StatusIcon className="h-3 w-3" />
                              {STATUS_LABELS[webhook.processing_status] || 'En attente'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {webhook.retry_count > 0 ? (
                              <span className={webhook.retry_count >= 5 ? 'text-destructive' : ''}>
                                {webhook.retry_count}/5
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {webhook.error_message ? (
                              <span className="text-xs text-destructive line-clamp-2" title={webhook.error_message}>
                                {webhook.error_message}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setViewingWebhook(webhook)}
                                title="Voir le payload"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(webhook.processing_status === 'failed' || webhook.processing_status === 'permanently_failed') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => retryWebhookMutation.mutate(webhook.id)}
                                  disabled={retryWebhookMutation.isPending}
                                  title="Réessayer"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} sur {totalPages || 1} • {totalCount} webhooks
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog pour voir le payload */}
      <Dialog open={!!viewingWebhook} onOpenChange={(open) => !open && setViewingWebhook(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline">{viewingWebhook?.event_type}</Badge>
              <Badge variant={getStatusBadge(viewingWebhook?.processing_status)}>
                {STATUS_LABELS[viewingWebhook?.processing_status] || 'En attente'}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Event ID: <span className="font-mono">{viewingWebhook?.event_id}</span>
              <br />
              Reçu le: {viewingWebhook && new Date(viewingWebhook.created_at).toLocaleString('fr-FR')}
              {viewingWebhook?.last_retry_at && (
                <>
                  <br />
                  Dernière tentative: {new Date(viewingWebhook.last_retry_at).toLocaleString('fr-FR')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewingWebhook?.error_message && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive">Erreur:</p>
              <p className="text-sm text-destructive">{viewingWebhook.error_message}</p>
            </div>
          )}

          <div className="overflow-auto max-h-[50vh]">
            <p className="text-sm font-medium mb-2">Payload:</p>
            <pre className="p-4 bg-muted rounded-lg text-xs overflow-auto">
              {JSON.stringify(viewingWebhook?.payload, null, 2)}
            </pre>
          </div>

          <div className="flex justify-end gap-2">
            {(viewingWebhook?.processing_status === 'failed' || viewingWebhook?.processing_status === 'permanently_failed') && (
              <Button
                variant="outline"
                onClick={() => {
                  retryWebhookMutation.mutate(viewingWebhook.id);
                  setViewingWebhook(null);
                }}
                disabled={retryWebhookMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Réessayer
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewingWebhook(null)}>
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
