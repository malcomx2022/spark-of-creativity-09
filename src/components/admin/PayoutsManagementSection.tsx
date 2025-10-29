import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign, Users, TrendingUp, Calendar } from "lucide-react";

export function PayoutsManagementSection() {
  const [selectedPractitioners, setSelectedPractitioners] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("momo");
  const queryClient = useQueryClient();

  // Fetch practitioner balances
  const { data: balances, isLoading } = useQuery({
    queryKey: ['practitioner-balances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioner_balances')
        .select('*, practitioners(id, name, phone)')
        .gt('balance_available', 0)
        .order('balance_available', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch payout batches
  const { data: batches } = useQuery({
    queryKey: ['payout-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    }
  });

  // Create payout batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-payout-batch', {
        body: {
          practitionerIds: selectedPractitioners,
          paymentMethod
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Lot de versement créé avec succès');
      setSelectedPractitioners([]);
      queryClient.invalidateQueries({ queryKey: ['payout-batches'] });
      queryClient.invalidateQueries({ queryKey: ['practitioner-balances'] });
    },
    onError: (error: Error) => {
      toast.error('Erreur lors de la création du lot: ' + error.message);
    }
  });

  const totalAvailable = balances?.reduce((sum, b) => sum + b.balance_available, 0) || 0;
  const totalPending = balances?.reduce((sum, b) => sum + b.balance_pending, 0) || 0;
  const selectedAmount = balances
    ?.filter(b => selectedPractitioners.includes(b.practitioner_id))
    .reduce((sum, b) => sum + b.balance_available, 0) || 0;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      'queued': 'secondary',
      'processing': 'default',
      'sent': 'outline',
      'failed': 'destructive',
      'partially_sent': 'secondary'
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const togglePractitioner = (id: string) => {
    setSelectedPractitioners(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Disponible Total</p>
              <p className="text-2xl font-bold">{totalAvailable.toLocaleString()} XOF</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-secondary/10 rounded-lg">
              <TrendingUp className="h-6 w-6 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">En Attente</p>
              <p className="text-2xl font-bold">{totalPending.toLocaleString()} XOF</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent/10 rounded-lg">
              <Users className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Praticiens</p>
              <p className="text-2xl font-bold">{balances?.length || 0}</p>
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
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Méthode de Paiement</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="momo">Mobile Money</SelectItem>
                <SelectItem value="bank">Virement Bancaire</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => createBatchMutation.mutate()}
            disabled={selectedPractitioners.length === 0 || createBatchMutation.isPending}
          >
            {createBatchMutation.isPending ? 'Création...' : `Créer Lot (${selectedPractitioners.length})`}
          </Button>
        </div>
      </Card>

      {/* Practitioner Balances */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Soldes Disponibles</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Praticien</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">En Attente</TableHead>
                <TableHead className="text-right">En Hold</TableHead>
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
                  <TableRow key={balance.practitioner_id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPractitioners.includes(balance.practitioner_id)}
                        onCheckedChange={() => togglePractitioner(balance.practitioner_id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{balance.practitioners?.name || 'N/A'}</TableCell>
                    <TableCell>{balance.practitioners?.phone || 'N/A'}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {balance.balance_available.toLocaleString()} XOF
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {balance.balance_pending.toLocaleString()} XOF
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {balance.balance_on_hold.toLocaleString()} XOF
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
                    Aucun solde disponible
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Recent Batches */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Lots Récents</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Méthode</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Praticiens</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Traité Le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches && batches.length > 0 ? (
                batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      {new Date(batch.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell className="capitalize">{batch.payment_method}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {batch.total_amount.toLocaleString()} XOF
                    </TableCell>
                    <TableCell className="text-right">{batch.practitioners_count}</TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell>
                      {batch.processed_at 
                        ? new Date(batch.processed_at).toLocaleDateString('fr-FR')
                        : '-'}
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
    </div>
  );
}
