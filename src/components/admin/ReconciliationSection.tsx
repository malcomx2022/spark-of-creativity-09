import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Calendar, Download, TrendingUp } from "lucide-react";
import { useState } from "react";
import { formatAmount } from "@/lib/payment-config";

interface Anomaly {
  type: 'missing_in_db' | 'missing_in_fedapay' | 'amount_mismatch' | 'status_mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  fedapay_transaction_id?: string;
  db_payment_id?: string;
  fedapay_amount?: number;
  db_amount?: number;
  fedapay_status?: string;
  db_status?: string;
  description: string;
  recommendation: string;
}

interface ReconciliationReport {
  id: string;
  created_at: string;
  period_start: string;
  period_end: string;
  status: string;
  total_fedapay_transactions: number;
  total_db_payments: number;
  matched_count: number;
  missing_in_db_count: number;
  missing_in_fedapay_count: number;
  amount_mismatch_count: number;
  status_mismatch_count: number;
  total_amount_discrepancy: number;
  anomalies: Anomaly[];
  recommendations: string[];
  completed_at: string | null;
}

export default function ReconciliationSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<ReconciliationReport | null>(null);

  // Fetch reconciliation reports
  const { data: reports, isLoading } = useQuery({
    queryKey: ["reconciliation-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reconciliation_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return (data || []).map(report => ({
        ...report,
        anomalies: (report.anomalies as unknown as Anomaly[]) || [],
        recommendations: (report.recommendations as unknown as string[]) || [],
      })) as ReconciliationReport[];
    },
  });

  // Run reconciliation mutation
  const reconcileMutation = useMutation({
    mutationFn: async ({ period_start, period_end }: { period_start?: string; period_end?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await invokeEdgeFunctionWithRetry('reconcile-fedapay', {
        body: { period_start, period_end },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-reports"] });
      toast({
        title: "Réconciliation terminée",
        description: "Le rapport de réconciliation a été généré avec succès.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getSeverityBadge = (severity: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      low: { variant: "outline", label: "Faible" },
      medium: { variant: "secondary", label: "Moyen" },
      high: { variant: "destructive", label: "Élevé" },
      critical: { variant: "destructive", label: "Critique" },
    };
    const { variant, label } = config[severity] || config.medium;
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      in_progress: { variant: "secondary", label: "En cours" },
      completed: { variant: "default", label: "Terminé" },
      failed: { variant: "destructive", label: "Échoué" },
    };
    const { variant, label } = config[status] || config.in_progress;
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getAnomalyTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      missing_in_db: "Manquant en BD",
      missing_in_fedapay: "Manquant FedaPay",
      amount_mismatch: "Écart de montant",
      status_mismatch: "Statut différent",
    };
    return labels[type] || type;
  };

  const runReconciliation = () => {
    // Run for last 7 days by default
    const period_start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const period_end = new Date().toISOString();
    reconcileMutation.mutate({ period_start, period_end });
  };

  const exportReport = (report: ReconciliationReport) => {
    const csvContent = [
      ['Type', 'Sévérité', 'ID FedaPay', 'ID BD', 'Description', 'Recommandation'],
      ...(report.anomalies || []).map(a => [
        getAnomalyTypeLabel(a.type),
        a.severity,
        a.fedapay_transaction_id || '',
        a.db_payment_id || '',
        a.description,
        a.recommendation,
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation-${format(new Date(report.created_at), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export réussi",
      description: "Le rapport a été exporté en CSV.",
    });
  };

  const latestReport = reports?.[0];
  const totalAnomalies = latestReport ? 
    (latestReport.missing_in_db_count + latestReport.missing_in_fedapay_count + 
     latestReport.amount_mismatch_count + latestReport.status_mismatch_count) : 0;

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Transactions Concordantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{latestReport?.matched_count || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Sur {latestReport?.total_fedapay_transactions || 0} FedaPay
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Anomalies Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{totalAnomalies}</div>
            <p className="text-xs text-muted-foreground mt-1">
              À traiter
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Écart Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatAmount(latestReport?.total_amount_discrepancy || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Différence de montants
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Dernière Réconciliation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {latestReport 
                ? format(new Date(latestReport.created_at), "dd MMM HH:mm", { locale: fr })
                : "Aucune"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {latestReport?.status === 'completed' ? 'Terminée' : 'En cours'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Button */}
      <Card>
        <CardHeader>
          <CardTitle>Lancer une Réconciliation</CardTitle>
          <CardDescription>
            Comparer les transactions FedaPay avec la base de données (7 derniers jours)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={runReconciliation}
            disabled={reconcileMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
            {reconcileMutation.isPending ? 'Réconciliation en cours...' : 'Lancer la réconciliation'}
          </Button>
        </CardContent>
      </Card>

      {/* Reports List and Details */}
      <Tabs defaultValue="reports" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="reports">Rapports ({reports?.length || 0})</TabsTrigger>
          <TabsTrigger value="details" disabled={!selectedReport}>
            Détails {selectedReport && `(${selectedReport.anomalies?.length || 0} anomalies)`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Réconciliations</CardTitle>
              <CardDescription>Tous les rapports de réconciliation générés</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead>FedaPay</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead>Concordants</TableHead>
                    <TableHead>Anomalies</TableHead>
                    <TableHead>Écart</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports && reports.length > 0 ? (
                    reports.map((report) => {
                      const anomaliesCount = 
                        report.missing_in_db_count + 
                        report.missing_in_fedapay_count + 
                        report.amount_mismatch_count + 
                        report.status_mismatch_count;
                      
                      return (
                        <TableRow key={report.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell>{format(new Date(report.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}</TableCell>
                          <TableCell>
                            {format(new Date(report.period_start), "dd/MM", { locale: fr })} - {format(new Date(report.period_end), "dd/MM", { locale: fr })}
                          </TableCell>
                          <TableCell>{report.total_fedapay_transactions}</TableCell>
                          <TableCell>{report.total_db_payments}</TableCell>
                          <TableCell className="font-bold text-green-600">{report.matched_count}</TableCell>
                          <TableCell>
                            <Badge variant={anomaliesCount > 0 ? "destructive" : "outline"}>
                              {anomaliesCount}
                            </Badge>
                          </TableCell>
                          <TableCell className={report.total_amount_discrepancy > 0 ? "text-destructive font-bold" : ""}>
                            {formatAmount(report.total_amount_discrepancy)}
                          </TableCell>
                          <TableCell>{getStatusBadge(report.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedReport(report)}
                              >
                                Voir
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => exportReport(report)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        {isLoading ? "Chargement..." : "Aucun rapport disponible"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          {selectedReport && (
            <>
              {/* Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle>Recommandations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedReport.recommendations?.map((rec, index) => (
                      <div key={index} className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{rec}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Anomalies Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Détail des Anomalies ({selectedReport.anomalies?.length || 0})</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Sévérité</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>FedaPay ID</TableHead>
                        <TableHead>DB ID</TableHead>
                        <TableHead>Recommandation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedReport.anomalies?.map((anomaly, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge variant="outline">
                              {getAnomalyTypeLabel(anomaly.type)}
                            </Badge>
                          </TableCell>
                          <TableCell>{getSeverityBadge(anomaly.severity)}</TableCell>
                          <TableCell className="max-w-md">
                            <p className="text-sm">{anomaly.description}</p>
                            {anomaly.fedapay_amount && anomaly.db_amount && (
                              <p className="text-xs text-muted-foreground mt-1">
                                FedaPay: {formatAmount(anomaly.fedapay_amount)} | DB: {formatAmount(anomaly.db_amount)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {anomaly.fedapay_transaction_id || '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {anomaly.db_payment_id?.slice(0, 8) || '-'}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="text-xs text-muted-foreground">{anomaly.recommendation}</p>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
