import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, CheckCircle, Phone, Trash2, RefreshCw, Search, Download, Clock, XCircle, MessageSquare, PhoneCall, Activity, TrendingUp, Filter } from 'lucide-react';
import { useOTPAttempts, useBlockedNumbers, useResetOTPAttempts, useDeleteOTPAttempt } from '@/hooks/useOTPManagement';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Labels français pour les statuts
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  failed: 'Échoué',
  delivered: 'Délivré',
  expired: 'Expiré',
};

// Labels français pour les canaux
const CHANNEL_LABELS: Record<string, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  call: 'Appel',
};

export function OTPManagementSection() {
  const resetAttempts = useResetOTPAttempts();
  const deleteAttempt = useDeleteOTPAttempt();

  // États pour les filtres
  const [searchPhone, setSearchPhone] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Filtrage et pagination effectués par l'API (GET /admin/otp/attempts)
  const { data: attemptsPage, isLoading: attemptsLoading, refetch: refetchAttempts } = useOTPAttempts({
    phone: searchPhone || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    channel: channelFilter !== 'all' ? channelFilter : undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
    page: page - 1,
    limit,
  });
  const { data: blockedNumbers = [], isLoading: blockedLoading, refetch: refetchBlocked } = useBlockedNumbers();

  // Statistiques globales (GET /admin/otp/stats)
  const { data: stats } = useQuery({
    queryKey: ['otp-stats'],
    queryFn: () => api.get<{ total: number; today: number; week: number; successRate: number; byChannel: Record<string, number> }>('/admin/otp/stats'),
  });

  // Tentatives de la page courante (déjà filtrées par l'API)
  const filteredAttempts = attemptsPage?.data ?? [];
  const totalCount = attemptsPage?.count ?? 0;

  // Pagination
  const totalPages = Math.ceil(totalCount / limit);
  const paginatedAttempts = filteredAttempts;

  const hasActiveFilters = searchPhone || statusFilter !== 'all' || channelFilter !== 'all' || dateFrom || dateTo;

  const resetFilters = () => {
    setSearchPhone('');
    setStatusFilter('all');
    setChannelFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // Export CSV
  const handleExport = () => {
    const escapeCSV = (val: unknown) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ['Date', 'Numéro', 'Canal', 'Statut', 'Erreur', 'Twilio SID'];
    const rows = filteredAttempts.map(a => [
      escapeCSV(formatDate(a.created_at)),
      escapeCSV(a.phone_number),
      escapeCSV(CHANNEL_LABELS[a.channel] || a.channel),
      escapeCSV(STATUS_LABELS[a.status] || a.status),
      escapeCSV(a.error_message || ''),
      escapeCSV(a.twilio_sid || ''),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `otp_attempts_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Le journal d'audit est alimenté par l'API pour ces deux actions.
  const handleReset = async (phoneNumber: string) => {
    await resetAttempts.mutateAsync(phoneNumber);
  };

  const handleDelete = async (attemptId: string) => {
    await deleteAttempt.mutateAsync(attemptId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500">En attente</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500">Échoué</Badge>;
      case 'delivered':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500">Délivré</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getChannelBadge = (channel: string) => {
    const colors = {
      sms: 'bg-primary/10 text-primary',
      whatsapp: 'bg-green-500/10 text-green-600',
      call: 'bg-orange-500/10 text-orange-600',
    };
    return (
      <Badge variant="outline" className={colors[channel as keyof typeof colors] || ''}>
        {channel.toUpperCase()}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Gestion des OTP</h2>
        <p className="text-muted-foreground">
          Gérez les tentatives d'envoi d'OTP et débloquez les utilisateurs
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">tentatives enregistrées</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aujourd'hui</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.today || 0}</div>
            <p className="text-xs text-muted-foreground">dernières 24h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cette semaine</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.week || 0}</div>
            <p className="text-xs text-muted-foreground">7 derniers jours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux succès</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.successRate || 0}%</div>
            <p className="text-xs text-muted-foreground">OTP délivrés</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bloqués</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{blockedNumbers.length}</div>
            <p className="text-xs text-muted-foreground">numéros à débloquer</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="blocked" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="blocked">
            Numéros bloqués
            {blockedNumbers.length > 0 && (
              <Badge className="ml-2" variant="destructive">
                {blockedNumbers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Historique des tentatives</TabsTrigger>
        </TabsList>

        <TabsContent value="blocked" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <CardTitle>Numéros potentiellement bloqués</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchBlocked()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualiser
                </Button>
              </div>
              <CardDescription>
                Numéros ayant 3+ tentatives OTP dans la dernière heure
              </CardDescription>
            </CardHeader>
            <CardContent>
              {blockedLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement...
                </div>
              ) : blockedNumbers.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Aucun numéro bloqué pour le moment
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro de téléphone</TableHead>
                      <TableHead>Tentatives</TableHead>
                      <TableHead>Dernière tentative</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedNumbers.map((entry) => (
                      <TableRow key={entry.phone_number}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {entry.phone_number}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">{entry.attempts}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(entry.last_attempt)}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resetAttempts.isPending}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Débloquer
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Débloquer le numéro</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Êtes-vous sûr de vouloir réinitialiser les tentatives OTP pour{' '}
                                  <strong>{entry.phone_number}</strong> ?
                                  <br />
                                  <br />
                                  Cela supprimera toutes les tentatives enregistrées et permettra
                                  à l'utilisateur de recevoir un nouveau code OTP.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleReset(entry.phone_number)}
                                >
                                  Confirmer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Historique des tentatives OTP</CardTitle>
                  <CardDescription>
                    {totalCount} tentatives {hasActiveFilters && '(filtré)'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => refetchAttempts()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Actualiser
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtres */}
              <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filtres:</span>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher un numéro..."
                      value={searchPhone}
                      onChange={(e) => { setSearchPhone(e.target.value); setPage(1); }}
                      className="pl-8"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="delivered">Délivré</SelectItem>
                    <SelectItem value="failed">Échoué</SelectItem>
                    <SelectItem value="expired">Expiré</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les canaux</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="call">Appel</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-[150px]"
                  placeholder="Du"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="w-[150px]"
                  placeholder="Au"
                />
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    Réinitialiser
                  </Button>
                )}
              </div>

              {attemptsLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement...
                </div>
              ) : paginatedAttempts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {hasActiveFilters ? 'Aucune tentative correspondant aux filtres' : 'Aucune tentative enregistrée'}
                </div>
              ) : (
                <TooltipProvider>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Numéro</TableHead>
                          <TableHead>Canal</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Erreur</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedAttempts.map((attempt) => (
                          <TableRow key={attempt.id}>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(attempt.created_at)}
                            </TableCell>
                            <TableCell className="font-medium font-mono">
                              {attempt.phone_number}
                            </TableCell>
                            <TableCell>{getChannelBadge(attempt.channel)}</TableCell>
                            <TableCell>{getStatusBadge(attempt.status)}</TableCell>
                            <TableCell className="max-w-xs">
                              {attempt.error_message && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-red-500 truncate block cursor-help max-w-[200px]">
                                      {attempt.error_message}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-md">
                                    <p className="text-sm">{attempt.error_message}</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={deleteAttempt.isPending}
                                    title="Supprimer cette tentative"
                                    aria-label="Supprimer cette tentative OTP"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Supprimer la tentative</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Êtes-vous sûr de vouloir supprimer cette tentative pour {attempt.phone_number} ?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(attempt.id)}
                                    >
                                      Supprimer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TooltipProvider>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    {(page - 1) * limit + 1}-{Math.min(page * limit, totalCount)} sur {totalCount}
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
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
