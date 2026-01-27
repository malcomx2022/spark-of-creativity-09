import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Search, RefreshCw, Download, Calendar, User, Activity, Shield } from "lucide-react";
import { useState, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "@/hooks/use-toast";

// Labels français pour les actions
const ACTION_LABELS: Record<string, string> = {
  // Admin
  create_admin: 'Création admin',
  disable_admin: 'Désactivation admin',
  reset_password: 'Réinitialisation MDP',
  // KYC
  kyc_approved: 'KYC approuvé',
  kyc_rejected: 'KYC rejeté',
  validate_kyc: 'Validation KYC',
  reject_kyc: 'Rejet KYC',
  // Support
  update_ticket_status: 'Mise à jour ticket',
  create_faq: 'Création FAQ',
  update_faq: 'Modification FAQ',
  delete_faq: 'Suppression FAQ',
  publish_faq: 'Publication FAQ',
  unpublish_faq: 'Dépublication FAQ',
  // Finance
  'Refund processed': 'Remboursement traité',
  // Operations
  'Dispute open': 'Litige ouvert',
  'Dispute investigating': 'Litige en cours',
  'Dispute resolved': 'Litige résolu',
  'Dispute closed': 'Litige fermé',
  // Compliance
  create_consent_version: 'Création consentement',
  activate_consent_version: 'Activation consentement',
  deactivate_consent_version: 'Désactivation consentement',
  update_system_config: 'Modification config',
  create_system_config: 'Création config',
};

const getActionLabel = (action: string): string => {
  return ACTION_LABELS[action] || action;
};

const getActionVariant = (action: string): "default" | "secondary" | "outline" | "destructive" => {
  if (action.includes('delete') || action.includes('disable') || action.includes('reject')) {
    return 'destructive';
  }
  if (action.includes('create') || action.includes('approve') || action.includes('activate')) {
    return 'default';
  }
  if (action.includes('update') || action.includes('publish')) {
    return 'secondary';
  }
  return 'outline';
};

export function AuditLogs() {
  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebouncedValue(searchInput, 300);
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterAdmin, setFilterAdmin] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Récupérer les types d'entités pour le filtre
  const { data: entityTypesData } = useQuery({
    queryKey: ['audit-entity-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('entity_type')
        .limit(1000);

      if (error) throw error;
      return [...new Set(data?.map(l => l.entity_type) || [])].sort();
    },
  });

  // Récupérer les actions pour le filtre
  const { data: actionsData } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('action')
        .limit(1000);

      if (error) throw error;
      return [...new Set(data?.map(l => l.action) || [])].sort();
    },
  });

  // Récupérer les admins pour le filtre
  const { data: adminsData } = useQuery({
    queryKey: ['audit-admins'],
    queryFn: async () => {
      const { data: logs, error: logsError } = await supabase
        .from('admin_audit_logs')
        .select('admin_id')
        .limit(1000);

      if (logsError) throw logsError;

      const adminIds = [...new Set(logs?.map(l => l.admin_id) || [])];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', adminIds);

      if (profilesError) throw profilesError;
      return profiles || [];
    },
  });

  // Statistiques
  const { data: statsData } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [todayResult, weekResult, totalResult] = await Promise.all([
        supabase
          .from('admin_audit_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', today.toISOString()),
        supabase
          .from('admin_audit_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgo.toISOString()),
        supabase
          .from('admin_audit_logs')
          .select('id', { count: 'exact', head: true }),
      ]);

      return {
        today: todayResult.count || 0,
        week: weekResult.count || 0,
        total: totalResult.count || 0,
      };
    },
  });

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', page, filterEntity, filterAction, filterAdmin, filterDateFrom, filterDateTo, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Filtrage côté serveur
      if (filterEntity !== 'all') {
        query = query.eq('entity_type', filterEntity);
      }

      if (filterAction !== 'all') {
        query = query.eq('action', filterAction);
      }

      if (filterAdmin !== 'all') {
        query = query.eq('admin_id', filterAdmin);
      }

      if (filterDateFrom) {
        query = query.gte('created_at', `${filterDateFrom}T00:00:00`);
      }

      if (filterDateTo) {
        query = query.lte('created_at', `${filterDateTo}T23:59:59`);
      }

      // P1 #8: Require minimum search term length to prevent enumeration attacks
      if (searchTerm && searchTerm.length >= 3) {
        // Escape special characters to prevent pattern injection
        const escapedSearch = searchTerm.replace(/[%_\\]/g, '\\$&');
        query = query.or(`action.ilike.%${escapedSearch}%,entity_id.ilike.%${escapedSearch}%`);
      }

      const { data: logsData, error: logsError, count } = await query
        .range((page - 1) * limit, page * limit - 1);

      if (logsError) throw logsError;
      if (!logsData) return { logs: [], total: 0 };

      // Récupérer les profils séparément
      const adminIds = [...new Set(logsData.map(l => l.admin_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', adminIds);

      if (profilesError) throw profilesError;

      // Combiner les données
      return {
        logs: logsData.map(log => ({
          ...log,
          profile: profiles?.find(p => p.id === log.admin_id)
        })),
        total: count || 0
      };
    },
  });

  const totalPages = Math.ceil((logsData?.total || 0) / limit);
  const logs = logsData?.logs || [];
  const entityTypes = entityTypesData || [];
  const actions = actionsData || [];
  const admins = adminsData || [];

  // Reset page when filters change
  const resetFilters = () => {
    setFilterEntity('all');
    setFilterAction('all');
    setFilterAdmin('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchInput('');
    setPage(1);
  };

  // Export to CSV
  const exportToCSV = async () => {
    try {
      let query = supabase
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterEntity !== 'all') query = query.eq('entity_type', filterEntity);
      if (filterAction !== 'all') query = query.eq('action', filterAction);
      if (filterAdmin !== 'all') query = query.eq('admin_id', filterAdmin);
      if (filterDateFrom) query = query.gte('created_at', `${filterDateFrom}T00:00:00`);
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`);

      const { data, error } = await query.limit(5000);

      if (error) throw error;

      // Get admin names
      const adminIds = [...new Set(data?.map(l => l.admin_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', adminIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      // Generate CSV
      const headers = ['Date', 'Admin', 'Action', 'Type Entité', 'ID Entité', 'Détails', 'IP'];
      const rows = (data || []).map(log => [
        new Date(log.created_at).toLocaleString('fr-FR'),
        profileMap.get(log.admin_id) || 'N/A',
        getActionLabel(log.action),
        log.entity_type,
        log.entity_id || '',
        log.details ? JSON.stringify(log.details) : '',
        log.ip_address ? log.ip_address.replace(/\.\d+\.\d+$/, '.***.**') : '',
      ]);

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Export réussi', description: `${data?.length || 0} entrées exportées` });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible d\'exporter les logs', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Aujourd'hui
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData?.today || 0}</div>
            <p className="text-xs text-muted-foreground">actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Cette semaine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData?.week || 0}</div>
            <p className="text-xs text-muted-foreground">actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData?.total || 0}</div>
            <p className="text-xs text-muted-foreground">entrées</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              Admins actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{admins.length}</div>
            <p className="text-xs text-muted-foreground">utilisateurs</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Journal d'audit
              </CardTitle>
              <CardDescription>
                Historique des actions critiques effectuées par les administrateurs
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters Row 1: Search + Entity + Action */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher (min. 3 car.)..."
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={filterEntity} onValueChange={(v) => { setFilterEntity(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type d'entité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes entités</SelectItem>
                {entityTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes actions</SelectItem>
                {actions.map(action => (
                  <SelectItem key={action} value={action}>{getActionLabel(action)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filters Row 2: Admin + Dates */}
          <div className="flex flex-wrap gap-4 mb-4">
            <Select value={filterAdmin} onValueChange={(v) => { setFilterAdmin(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Admin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les admins</SelectItem>
                {admins.map(admin => (
                  <SelectItem key={admin.id} value={admin.id}>{admin.full_name || 'N/A'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Du</span>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                className="w-[150px]"
              />
              <span className="text-sm text-muted-foreground">au</span>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                className="w-[150px]"
              />
            </div>
            {(filterEntity !== 'all' || filterAction !== 'all' || filterAdmin !== 'all' || filterDateFrom || filterDateTo || searchInput) && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Réinitialiser filtres
              </Button>
            )}
          </div>

          {searchInput.length > 0 && searchInput.length < 3 && (
            <p className="text-xs text-muted-foreground mb-4">
              Entrez au moins 3 caractères pour rechercher
            </p>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : logs && logs.length > 0 ? (
            <>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Heure</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entité</TableHead>
                      <TableHead>Détails</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{log.profile?.full_name || 'N/A'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionVariant(log.action)}>
                            {getActionLabel(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{log.entity_type}</div>
                            {log.entity_id && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-muted-foreground cursor-help">
                                      {log.entity_id.slice(0, 8)}...
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-mono text-xs">{log.entity_id}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {!log.entity_id && (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.details ? (
                            <details className="cursor-pointer">
                              <summary className="text-primary text-sm hover:underline">Voir détails</summary>
                              <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-w-xs max-h-32">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {/* Obfuscation partielle des adresses IP pour GDPR */}
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {log.ip_address
                            ? log.ip_address.replace(/\.\d+\.\d+$/, '.***.**')
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} sur {totalPages || 1} • {logsData?.total || 0} entrées
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
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {filterEntity !== 'all' || filterAction !== 'all' || filterAdmin !== 'all' || filterDateFrom || filterDateTo || searchInput
                ? 'Aucun log correspondant aux filtres'
                : 'Aucun log trouvé'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}