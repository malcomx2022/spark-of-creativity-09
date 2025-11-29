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

export function AuditLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: async () => {
      const { data: logsData, error: logsError, count } = await supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
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

  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchTerm || 
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterEntity === 'all' || log.entity_type === filterEntity;
    
    return matchesSearch && matchesFilter;
  });

  const entityTypes = [...new Set(logs.map(l => l.entity_type))];

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
              placeholder="Rechercher une action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
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
        ) : filteredLogs && filteredLogs.length > 0 ? (
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
                  {filteredLogs.map((log) => (
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
                      <TableCell className="text-xs text-muted-foreground">
                        {log.ip_address || 'N/A'}
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