import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Search, Eye, Phone, Calendar, MapPin, Filter, RefreshCw, User, UserX, Download, TrendingUp, Info, Monitor } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SearchActivityLog {
  id: string;
  user_id: string | null;
  session_id: string;
  action_type: string;
  practitioner_id: string | null;
  search_filters: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  user_agent: string | null;
  created_at: string;
}

const actionTypeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  view_search_page: { label: 'Vue page', icon: <Eye className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
  filter_specialty: { label: 'Filtre spécialité', icon: <Filter className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
  filter_zone: { label: 'Filtre zone', icon: <MapPin className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
  view_practitioner_details: { label: 'Détails praticien', icon: <Eye className="h-3 w-3" />, color: 'bg-purple-100 text-purple-800' },
  click_contact: { label: 'Clic contact', icon: <Phone className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
  click_appointment: { label: 'Clic RDV', icon: <Calendar className="h-3 w-3" />, color: 'bg-primary/20 text-primary' },
  click_itinerary: { label: 'Clic itinéraire', icon: <MapPin className="h-3 w-3" />, color: 'bg-orange-100 text-orange-800' },
  search_text: { label: 'Recherche texte', icon: <Search className="h-3 w-3" />, color: 'bg-indigo-100 text-indigo-800' },
  close_practitioner_details: { label: 'Fermeture détails', icon: <Eye className="h-3 w-3" />, color: 'bg-gray-100 text-gray-600' },
};

export default function SearchActivitySection() {
  const [filterActionType, setFilterActionType] = useState<string>('all');
  const [filterUserType, setFilterUserType] = useState<string>('all');
  const [searchSession, setSearchSession] = useState('');
  const [searchPractitioner, setSearchPractitioner] = useState('');
  const [dateRange, setDateRange] = useState<string>('7');
  const [page, setPage] = useState(1);
  const [viewingLog, setViewingLog] = useState<SearchActivityLog | null>(null);
  const limit = 50;

  const { data: logs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['search-activity-logs', filterActionType, filterUserType, dateRange],
    queryFn: async () => {
      let query = (supabase as any)
        .from('search_activity_logs')
        .select('*')
        .gte('created_at', subDays(new Date(), parseInt(dateRange)).toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      if (filterActionType !== 'all') {
        query = query.eq('action_type', filterActionType);
      }

      if (filterUserType === 'authenticated') {
        query = query.not('user_id', 'is', null);
      } else if (filterUserType === 'anonymous') {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SearchActivityLog[];
    },
  });

  // Stats
  const stats = {
    total: logs?.length || 0,
    authenticated: logs?.filter(l => l.user_id).length || 0,
    anonymous: logs?.filter(l => !l.user_id).length || 0,
    appointmentClicks: logs?.filter(l => l.action_type === 'click_appointment').length || 0,
    contactClicks: logs?.filter(l => l.action_type === 'click_contact').length || 0,
  };

  const filteredLogs = logs?.filter(log => {
    if (searchSession && !log.session_id.toLowerCase().includes(searchSession.toLowerCase())) {
      return false;
    }
    if (searchPractitioner) {
      const practitionerName = String(log.metadata?.practitioner_name || '').toLowerCase();
      if (!practitionerName.includes(searchPractitioner.toLowerCase())) {
        return false;
      }
    }
    return true;
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / limit);
  const paginatedLogs = filteredLogs.slice((page - 1) * limit, page * limit);

  // Taux de conversion
  const viewDetails = logs?.filter(l => l.action_type === 'view_practitioner_details').length || 0;
  const conversionRate = viewDetails > 0
    ? Math.round((stats.appointmentClicks / viewDetails) * 100)
    : 0;

  // Export CSV
  const handleExport = () => {
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ['Date', 'Type utilisateur', 'Action', 'Praticien', 'Catégorie', 'Recherche', 'Session', 'User Agent'];
    const rows = filteredLogs.map(log => [
      escapeCSV(format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: fr })),
      escapeCSV(log.user_id ? 'Connecté' : 'Anonyme'),
      escapeCSV(actionTypeLabels[log.action_type]?.label || log.action_type),
      escapeCSV(log.metadata?.practitioner_name || ''),
      escapeCSV(log.search_filters?.category || ''),
      escapeCSV(log.search_filters?.query || ''),
      escapeCSV(log.session_id),
      escapeCSV(log.user_agent || ''),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `search_activity_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = filterActionType !== 'all' || filterUserType !== 'all' || searchSession || searchPractitioner;

  const resetFilters = () => {
    setFilterActionType('all');
    setFilterUserType('all');
    setSearchSession('');
    setSearchPractitioner('');
    setPage(1);
  };

  const getActionBadge = (actionType: string) => {
    const config = actionTypeLabels[actionType] || { 
      label: actionType, 
      icon: <Eye className="h-3 w-3" />, 
      color: 'bg-gray-100 text-gray-800' 
    };
    return (
      <Badge variant="outline" className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Activité de recherche praticiens
              </CardTitle>
              <CardDescription>
                Suivi des actions des utilisateurs sur la page de recherche
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Actions totales</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.authenticated}</p>
              <p className="text-xs text-muted-foreground">Connectés</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.anonymous}</p>
              <p className="text-xs text-muted-foreground">Anonymes</p>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-primary">{stats.appointmentClicks}</p>
              <p className="text-xs text-muted-foreground">Clics RDV</p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.contactClicks}</p>
              <p className="text-xs text-muted-foreground">Clics contact</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{conversionRate}%</p>
              </div>
              <p className="text-xs text-muted-foreground">Conversion</p>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-3 mb-4 p-4 bg-muted/50 rounded-lg">
            <Select value={dateRange} onValueChange={(v) => { setDateRange(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Dernières 24h</SelectItem>
                <SelectItem value="7">7 derniers jours</SelectItem>
                <SelectItem value="30">30 derniers jours</SelectItem>
                <SelectItem value="90">90 derniers jours</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterActionType} onValueChange={(v) => { setFilterActionType(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type d'action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les actions</SelectItem>
                {Object.entries(actionTypeLabels).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterUserType} onValueChange={(v) => { setFilterUserType(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type d'utilisateur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="authenticated">Connectés</SelectItem>
                <SelectItem value="anonymous">Anonymes</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Rechercher par session..."
              value={searchSession}
              onChange={(e) => { setSearchSession(e.target.value); setPage(1); }}
              className="w-[180px]"
            />

            <Input
              placeholder="Rechercher praticien..."
              value={searchPractitioner}
              onChange={(e) => { setSearchPractitioner(e.target.value); setPage(1); }}
              className="w-[180px]"
            />

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Réinitialiser
              </Button>
            )}
          </div>

          {/* Info filtrage */}
          {filteredLogs.length > 0 && (
            <p className="text-sm text-muted-foreground mb-4">
              {filteredLogs.length} résultat{filteredLogs.length > 1 ? 's' : ''} {hasActiveFilters && '(filtré)'}
            </p>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {hasActiveFilters ? 'Aucune activité correspondant aux filtres' : 'Aucune activité trouvée pour cette période'}
            </div>
          ) : (
            <TooltipProvider>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Détails</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead className="w-[50px]">Info</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(log.created_at), 'dd/MM/yy HH:mm', { locale: fr })}
                        </TableCell>
                        <TableCell>
                          {log.user_id ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 flex items-center gap-1 w-fit cursor-help">
                                  <User className="h-3 w-3" />
                                  Connecté
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-mono text-xs">{log.user_id}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 flex items-center gap-1 w-fit">
                              <UserX className="h-3 w-3" />
                              Anonyme
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{getActionBadge(log.action_type)}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm text-muted-foreground truncate block cursor-help">
                                {log.metadata?.practitioner_name && (
                                  <span>Praticien: {String(log.metadata.practitioner_name)}</span>
                                )}
                                {log.search_filters?.category && (
                                  <span>Catégorie: {String(log.search_filters.category)}</span>
                                )}
                                {log.search_filters?.query && (
                                  <span>Recherche: "{String(log.search_filters.query)}"</span>
                                )}
                                {!log.metadata?.practitioner_name && !log.search_filters?.category && !log.search_filters?.query && '-'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-md">
                              <div className="text-xs space-y-1">
                                {log.metadata?.practitioner_name && (
                                  <p>Praticien: {String(log.metadata.practitioner_name)}</p>
                                )}
                                {log.search_filters?.category && (
                                  <p>Catégorie: {String(log.search_filters.category)}</p>
                                )}
                                {log.search_filters?.query && (
                                  <p>Recherche: "{String(log.search_filters.query)}"</p>
                                )}
                                {log.search_filters?.zone && (
                                  <p>Zone: {String(log.search_filters.zone)}</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs text-muted-foreground cursor-help">
                                {log.session_id.substring(0, 12)}...
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono text-xs">{log.session_id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingLog(log)}
                            title="Voir les détails"
                          >
                            <Info className="h-4 w-4" />
                          </Button>
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
                {(page - 1) * limit + 1}-{Math.min(page * limit, filteredLogs.length)} sur {filteredLogs.length}
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

      {/* Dialog détails */}
      <Dialog open={!!viewingLog} onOpenChange={() => setViewingLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Détails de l'activité
            </DialogTitle>
            <DialogDescription>
              Informations complètes sur cette action
            </DialogDescription>
          </DialogHeader>
          {viewingLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Date</p>
                  <p className="text-sm">{format(new Date(viewingLog.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: fr })}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Action</p>
                  {getActionBadge(viewingLog.action_type)}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Utilisateur</p>
                  {viewingLog.user_id ? (
                    <div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700">Connecté</Badge>
                      <p className="text-xs font-mono mt-1">{viewingLog.user_id}</p>
                    </div>
                  ) : (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700">Anonyme</Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Praticien consulté</p>
                  <p className="text-sm">
                    {viewingLog.practitioner_id ? (
                      <>
                        {viewingLog.metadata?.practitioner_name || 'Non spécifié'}
                        <span className="block text-xs font-mono text-muted-foreground">{viewingLog.practitioner_id}</span>
                      </>
                    ) : '-'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Session ID</p>
                <p className="text-xs font-mono bg-muted p-2 rounded">{viewingLog.session_id}</p>
              </div>

              {viewingLog.search_filters && Object.keys(viewingLog.search_filters).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Filtres de recherche</p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(viewingLog.search_filters, null, 2)}
                  </pre>
                </div>
              )}

              {viewingLog.metadata && Object.keys(viewingLog.metadata).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Métadonnées</p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(viewingLog.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {viewingLog.user_agent && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Monitor className="h-3 w-3" />
                    User Agent
                  </p>
                  <p className="text-xs bg-muted p-2 rounded break-all">{viewingLog.user_agent}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
