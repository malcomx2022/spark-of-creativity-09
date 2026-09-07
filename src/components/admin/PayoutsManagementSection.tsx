import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { DollarSign, Users, TrendingUp, Calendar, Play, Eye, AlertTriangle, CheckCircle, XCircle, RefreshCw } from "lucide-react";

interface BatchDetails {
  id: string;
  status: string;
  total_amount: number;
  practitioners_count: number;
  payment_method: string;
  created_at: string;
  processed_at: string | null;
  payouts: Array<{
    id: string;
    amount: number;
    status: string;
    practitioner_name: string | null;
    practitioner_phone: string | null;
  }>;
}

/** Ligne de GET /admin/finance/balances (praticien aplati). */
interface PractitionerBalanceRow {
  practitioner_id: string;
  balance_available: number;
  balance_pending: number;
  balance_on_hold: number;
  currency: string;
  last_payout_at: string | null;
  name: string;
  phone: string | null;
}

interface PayoutBatch {
  id: string;
  status: string;
  total_amount: number;
  practitioners_count: number;
  payment_method: string;
  created_at: string;
  processed_at: string | null;
}

interface ProcessingResults {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  failed: Array<{ practitionerId: string; name: string; error: string }>;
  skipped: Array<{ practitionerId: string; name: string; reason: string }>;
}

export function PayoutsManagementSection() {
  const [selectedPractitioners, setSelectedPractitioners] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("momo");
  const [selectedBatch, setSelectedBatch] = useState<BatchDetails | null>(null);
  const [showBatchDetails, setShowBatchDetails] = useState(false);
  const [processingResult, setProcessingResult] = useState<ProcessingResults | null>(null);
  const queryClient = useQueryClient();

  // Fetch practitioner balances
  const { data: balances, isLoading, refetch: refetchBalances } = useQuery({
    queryKey: ['practitioner-balances'],
    queryFn: async () => {
      const rows = await api.get<PractitionerBalanceRow[]>('/admin/finance/balances');
      return [...rows].sort((a, b) => b.balance_available - a.balance_available);
    }
  });

  // Fetch payout batches
  const { data: batches, refetch: refetchBatches } = useQuery({
    queryKey: ['payout-batches'],
    queryFn: async () => {
      const res = await api.get<{ data: PayoutBatch[] }>('/admin/finance/payout-batches', { query: { limit: 20 } });
      return res.data;
    }
  });

  // Create payout batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async () => {
      return api.post<{ batchId: string; totalAmount: number; practitionersCount: number }>('/admin/finance/payout-batches', {
        practitionerIds: selectedPractitioners,
        paymentMethod,
      });
    },
    onSuccess: (data) => {
      toast.success(`Lot créé: ${data.practitionersCount} praticiens, ${data.totalAmount.toLocaleString()} XOF`);
      setSelectedPractitioners([]);
      queryClient.invalidateQueries({ queryKey: ['payout-batches'] });
      queryClient.invalidateQueries({ queryKey: ['practitioner-balances'] });
    },
    onError: (error: unknown) => {
      toast.error('Erreur: ' + errorMessage(error, 'création du lot impossible'));
    }
  });

  // Process batch mutation
  const processBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      // Un transfert FedaPay par reversement : délai étendu
      return api.post<{ success: boolean; batchId: string; status: string; results: ProcessingResults }>(`/admin/finance/payout-batches/${batchId}/process`, undefined, { timeoutMs: 180_000 });
    },
    onSuccess: (data) => {
      setProcessingResult(data.results);
      toast.success(`Traitement terminé: ${data.results.successCount} réussis, ${data.results.failedCount} échoués`);
      refetchBatches();
      refetchBalances();
    },
    onError: (error: unknown) => {
      toast.error('Erreur de traitement: ' + errorMessage(error, 'traitement du lot impossible'));
    }
  });

  // Fetch batch details
  const fetchBatchDetails = async (batchId: string) => {
    const batch = await api.get<BatchDetails>(`/admin/finance/payout-batches/${batchId}`);
    setSelectedBatch(batch);
    setShowBatchDetails(true);
    setProcessingResult(null);
  };

  const totalAvailable = balances?.reduce((sum, b) => sum + b.balance_available, 0) || 0;
  const totalPending = balances?.reduce((sum, b) => sum + b.balance_pending, 0) || 0;
  const totalOnHold = balances?.reduce((sum, b) => sum + b.balance_on_hold, 0) || 0;
  const selectedAmount = balances
    ?.filter(b => selectedPractitioners.includes(b.practitioner_id))
    .reduce((sum, b) => sum + b.balance_available, 0) || 0;

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      'queued': { variant: 'secondary', label: 'En attente' },
      'processing': { variant: 'default', label: 'En cours' },
      'sent': { variant: 'outline', label: 'Envoyé' },
      'completed': { variant: 'outline', label: 'Terminé' },
      'failed': { variant: 'destructive', label: 'Échoué' },
      'partially_sent': { variant: 'secondary', label: 'Partiel' },
      'pending': { variant: 'secondary', label: 'En attente' },
      'pending_manual': { variant: 'secondary', label: 'Manuel' },
      'planned': { variant: 'outline', label: 'Planifié' }
    };
    const c = config[status] || { variant: 'default', label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const togglePractitioner = (id: string) => {
    setSelectedPractitioners(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectAllWithBalance = () => {
    const ids = balances?.filter(b => b.balance_available > 0).map(b => b.practitioner_id) || [];
    setSelectedPractitioners(ids);
  };

  const canProcess = (status: string) => {
    return ['queued', 'partially_sent', 'failed'].includes(status);
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Disponible</p>
              <p className="text-2xl font-bold text-green-600">{totalAvailable.toLocaleString()} XOF</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <TrendingUp className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">En Rétention</p>
              <p className="text-2xl font-bold text-yellow-600">{totalOnHold.toLocaleString()} XOF</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Praticiens avec solde</p>
              <p className="text-2xl font-bold">{balances?.filter(b => b.balance_available > 0).length || 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Sélectionné</p>
              <p className="text-2xl font-bold">{selectedAmount.toLocaleString()} XOF</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Create Batch */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Créer un Lot de Versement</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-2 block">Méthode de Paiement</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="momo">Mobile Money (MTN/Moov)</SelectItem>
                <SelectItem value="bank">Virement Bancaire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={selectAllWithBalance}>
            Tout sélectionner ({balances?.filter(b => b.balance_available > 0).length || 0})
          </Button>
          <Button
            onClick={() => createBatchMutation.mutate()}
            disabled={selectedPractitioners.length === 0 || createBatchMutation.isPending}
          >
            {createBatchMutation.isPending ? 'Création...' : `Créer Lot (${selectedPractitioners.length} - ${selectedAmount.toLocaleString()} XOF)`}
          </Button>
        </div>
      </Card>

      {/* Practitioner Balances */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Soldes des Praticiens</h3>
          <Button variant="ghost" size="sm" onClick={() => refetchBalances()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Praticien</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">En Rétention</TableHead>
                <TableHead className="text-right">En Attente</TableHead>
                <TableHead>Dernier Versement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">Chargement...</TableCell>
                </TableRow>
              ) : balances && balances.length > 0 ? (
                balances.map((balance) => (
                  <TableRow key={balance.practitioner_id} className={balance.balance_available === 0 ? 'opacity-50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPractitioners.includes(balance.practitioner_id)}
                        onCheckedChange={() => togglePractitioner(balance.practitioner_id)}
                        disabled={balance.balance_available === 0}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{balance.name || 'N/A'}</TableCell>
                    <TableCell>{balance.phone || 'Non renseigné'}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {balance.balance_available.toLocaleString()} XOF
                    </TableCell>
                    <TableCell className="text-right text-yellow-600">
                      {balance.balance_on_hold.toLocaleString()} XOF
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {balance.balance_pending.toLocaleString()} XOF
                    </TableCell>
                    <TableCell>
                      {balance.last_payout_at 
                        ? new Date(balance.last_payout_at).toLocaleDateString('fr-FR')
                        : 'Jamais'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Aucun praticien avec solde
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Recent Batches */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Lots de Versement</h3>
          <Button variant="ghost" size="sm" onClick={() => refetchBatches()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Méthode</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Praticiens</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches && batches.length > 0 ? (
                batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      {new Date(batch.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="capitalize">
                      {batch.payment_method === 'momo' ? 'Mobile Money' : 'Virement'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {batch.total_amount.toLocaleString()} XOF
                    </TableCell>
                    <TableCell className="text-right">{batch.practitioners_count}</TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchBatchDetails(batch.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canProcess(batch.status) && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              fetchBatchDetails(batch.id);
                            }}
                            disabled={processBatchMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Exécuter
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Aucun lot trouvé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Batch Details Dialog */}
      <Dialog open={showBatchDetails} onOpenChange={setShowBatchDetails}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails du Lot de Versement</DialogTitle>
            <DialogDescription>
              Créé le {selectedBatch && new Date(selectedBatch.created_at).toLocaleDateString('fr-FR')}
            </DialogDescription>
          </DialogHeader>

          {selectedBatch && (
            <div className="space-y-4">
              {/* Batch Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Montant Total</p>
                  <p className="text-xl font-bold">{selectedBatch.total_amount.toLocaleString()} XOF</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Praticiens</p>
                  <p className="text-xl font-bold">{selectedBatch.practitioners_count}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground">Statut</p>
                  <div className="mt-1">{getStatusBadge(selectedBatch.status)}</div>
                </Card>
              </div>

              {/* Processing Result */}
              {processingResult && (
                <Alert>
                  <AlertDescription>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>{processingResult.successCount} réussis</span>
                      </div>
                      <div className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span>{processingResult.failedCount} échoués</span>
                      </div>
                      <div className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{processingResult.skippedCount} ignorés</span>
                      </div>
                    </div>
                    {processingResult.skipped?.length > 0 && (
                      <div className="mt-2 text-sm">
                        <p className="font-medium">Ignorés:</p>
                        <ul className="list-disc list-inside">
                          {processingResult.skipped.map((s, i) => (
                            <li key={i}>{s.name}: {s.reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Payouts List */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Praticien</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedBatch.payouts?.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell className="font-medium">{payout.practitioner_name || 'N/A'}</TableCell>
                      <TableCell>{payout.practitioner_phone || 'Non renseigné'}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {payout.amount.toLocaleString()} XOF
                      </TableCell>
                      <TableCell>{getStatusBadge(payout.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDetails(false)}>
              Fermer
            </Button>
            {selectedBatch && canProcess(selectedBatch.status) && (
              <Button
                onClick={() => processBatchMutation.mutate(selectedBatch.id)}
                disabled={processBatchMutation.isPending}
              >
                {processBatchMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Traitement...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Exécuter les Paiements
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
