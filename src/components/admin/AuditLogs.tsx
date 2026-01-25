import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search } from "lucide-react";
import { useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export function AuditLogs() {
  const [searchInput, setSearchInput] = useState("");
  const searchTerm = useDebouncedValue(searchInput, 300);
  const [filterEntity, setFilterEntity] = useState<string>("all");
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
      return [...new Set(data?.map(l => l.entity_type) || [])];
    },
  });

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['audit-logs', page, filterEntity, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Filtrage côté serveur
      if (filterEntity !== 'all') {
        query = query.eq('entity_type', filterEntity);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Journal d'audit
        </CardTitle>
        <CardDescription>
          Historique des actions critiques effectuées par les administrateurs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une action (min. 3 caractères)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              minLength={3}
            />
            {searchInput.length > 0 && searchInput.length < 3 && (
              <p className="text-xs text-muted-foreground mt-1">
                Entrez au moins 3 caractères pour rechercher
              </p>
            )}
          </div>
          <Select value={filterEntity} onValueChange={setFilterEntity}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Type d'entité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entités</SelectItem>
              {entityTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Chargement...</div>
        ) : logs && logs.length > 0 ? (
          <>
            <div className="border rounded-lg">
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
                      <TableCell>{log.profile?.full_name || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{log.entity_type}</div>
                          <div className="text-muted-foreground">{log.entity_id?.slice(0, 8) || 'N/A'}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.details ? (
                          <details className="cursor-pointer">
                            <summary className="text-primary text-sm">Voir</summary>
                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-w-xs">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {/* P2 #13: Obfuscation partielle des adresses IP pour GDPR */}
                      <TableCell className="text-xs text-muted-foreground">
                        {log.ip_address
                          ? log.ip_address.replace(/\.\d+\.\d+$/, '.***.***)
                          : 'N/A'}
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
            Aucun log trouvé
          </div>
        )}
      </CardContent>
    </Card>
  );
}