import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

/** Ligne de GET /admin/audit-logs (nom de l'admin joint, IP partiellement masquée côté API). */
interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  ip_address: string | null;
  created_at: string;
  admin_name: string | null;
}

/** Réponse de GET /admin/audit-logs/filters. */
interface AuditFilters {
  entityTypes: string[];
  actions: string[];
  admins: { id: string; full_name: string | null }[];
  stats: { today: number; week: number; total: number; activeAdmins: number };
}

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

  // Valeurs des filtres et statistiques (GET /admin/audit-logs/filters)
  const { data: filtersData } = useQuery({
    queryKey: ['audit-filters'],
    queryFn: () => api.get<AuditFilters>('/admin/audit-logs/filters'),
  });
  const statsData = filtersData?.stats;

  // Filtres envoyés à l'API (recherche à partir de 3 caractères, comme avant)
  const auditQuery = (pageIndex: number, pageLimit: number) => {
    const q: Record<string, string | number> = { page: pageIndex, limit: pageLimit };
    if (filterEntity !== 'all') q.entityType = filterEntity;
    if (filterAction !== 'all') q.action = filterAction;
    if (filterAdmin !== 'all') q.adminId = filterAdmin;
    if (filterDateFrom) q.from = filterDateFrom;
    if (filterDateTo) q.to = filterDateTo;
    if (searchTerm && searchTerm.length >= 3) q.search = searchTerm;
    return q;
  };

  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', page, filterEntity, filterAction, filterAdmin, filterDateFrom, filterDateTo, searchTerm],
    queryFn: async () => {
      const res = await api.get<{ data: AuditLog[]; count: number }>('/admin/audit-logs', { query: auditQuery(page - 1, limit) });
      return { logs: res.data, total: res.count };
    },
  });

  const totalPages = Math.ceil((logsData?.total || 0) / limit);
  const logs = logsData?.logs || [];
  const entityTypes = filtersData?.entityTypes || [];
  const actions = filtersData?.actions || [];
  const admins = filtersData?.admins || [];

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
      // Mêmes filtres que la liste, jusqu'à 5000 lignes (limite de l'API)
      const res = await api.get<{ data: AuditLog[] }>('/admin/audit-logs', { query: auditQuery(0, 5000) });
      const data = res.data;

      // Generate CSV
      const headers = ['Date', 'Admin', 'Action', 'Type Entité', 'ID Entité', 'Détails', 'IP'];
      const rows = (data || []).map(log => [
        new Date(log.created_at).toLocaleString('fr-FR'),
        log.admin_name || 'N/A',
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
                          <span className="font-medium">{log.admin_name || 'N/A'}</span>
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