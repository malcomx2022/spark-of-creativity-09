import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Filter, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { PayoutsManagementSection } from './PayoutsManagementSection';
import { RefundsSection } from './RefundsSection';
import { WebhooksSection } from './WebhooksSection';
import { PaymentEventsSection } from './PaymentEventsSection';
import { FundsReleaseSection } from './FundsReleaseSection';
import ReconciliationSection from './ReconciliationSection';
import { PaymentFlowsDashboard } from './PaymentFlowsDashboard';
import { useState } from 'react';

// Status labels in French
const paymentStatusLabels: Record<string, string> = {
  pending: 'En attente',
  initiated: 'Initiée',
  processing: 'Traitement',
  paid: 'Payée',
  completed: 'Confirmée',
  failed: 'Échouée',
  canceled: 'Annulée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

const payoutStatusLabels: Record<string, string> = {
  planned: 'Planifié',
  queued: "File d'attente",
  processing: 'En traitement',
  sent: 'Envoyé',
  completed: 'Terminé',
  failed: 'Échec',
  pending: 'En attente',
  pending_manual: 'Manuel',
};

export function FinanceSection() {
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [payoutsPage, setPayoutsPage] = useState(1);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const limit = 20;

  // Fetch finance stats from view
  interface FinanceStats {
    total_revenue: number;
    pending_payments: number;
    completed_payments: number;
    pending_payouts: number;
    held_amount: number;
    total_commission: number;
  }
  
  const { data: stats } = useQuery<FinanceStats>({
    queryKey: ['admin-finance-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_finance_stats')
        .select('*')
        .maybeSingle();
      
      if (error) throw error;
      // P2 #18: Type-safe handling with explicit null checks
      const statsData = data as FinanceStats | null;
      return {
        total_revenue: statsData?.total_revenue ?? 0,
        pending_payments: statsData?.pending_payments ?? 0,
        completed_payments: statsData?.completed_payments ?? 0,
        pending_payouts: statsData?.pending_payouts ?? 0,
        held_amount: statsData?.held_amount ?? 0,
        total_commission: statsData?.total_commission ?? 0
      };
    },
  });

  const { data: paymentsData, isLoading: paymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: ['admin-payments', paymentsPage, paymentStatusFilter],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select(`
          *,
          patient:profiles!payments_patient_id_fkey(id, full_name, phone),
          appointment:appointments!payments_appointment_id_fkey(id, practitioner_name, specialty, date)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply status filter
      if (paymentStatusFilter !== 'all') {
        query = query.eq('status', paymentStatusFilter);
      }

      const { data, error, count } = await query.range((paymentsPage - 1) * limit, paymentsPage * limit - 1);

      if (error) throw error;
      return { payments: data || [], total: count || 0 };
    },
  });

  const { data: payoutsData, isLoading: payoutsLoading, refetch: refetchPayouts } = useQuery({
    queryKey: ['admin-payouts', payoutsPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('practitioner_payouts')
        .select(`
          *,
          practitioner:practitioners!practitioner_payouts_practitioner_id_fkey(id, name, phone)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((payoutsPage - 1) * limit, payoutsPage * limit - 1);

      if (error) throw error;
      return { payouts: data || [], total: count || 0 };
    },
  });

  const payments = paymentsData?.payments || [];
  const payouts = payoutsData?.payouts || [];
  const paymentsTotal = paymentsData?.total || 0;
  const payoutsTotal = payoutsData?.total || 0;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      completed: 'default',
      paid: 'default',
      pending: 'secondary',
      failed: 'destructive',
      cancelled: 'outline',
      canceled: 'outline',
      planned: 'secondary',
      sent: 'outline',
    };
    return variants[status] || 'outline';
  };

  const handleExportPayments = async () => {
    try {
      // P2 #17: Null safety dans les exports CSV
      const csv = payments.map(p =>
        `${new Date(p.created_at).toLocaleDateString('fr-FR')},${p.patient_id ?? 'N/A'},${p.amount ?? 0},${p.payment_method ?? 'N/A'},${p.status ?? 'N/A'}`
      ).join('\n');

      const header = 'Date,Patient,Montant,Méthode,Statut\n';
      const blob = new Blob([header + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `paiements-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Export réussi", description: `${payments.length} paiements exportés` });
    } catch (error) {
      // P3: Wrap console.error with DEV check
      if (import.meta.env.DEV) {
        console.error('Export error:', error);
      }
      toast({
        title: "Erreur d'export",
        description: "Impossible d'exporter les données",
        variant: "destructive"
      });
    }
  };

  const handleExportPayouts = async () => {
    try {
      // P2 #17: Null safety dans les exports CSV
      const csv = payouts.map(p =>
        `${p.period_start ? new Date(p.period_start).toLocaleDateString('fr-FR') : 'N/A'} - ${p.period_end ? new Date(p.period_end).toLocaleDateString('fr-FR') : 'N/A'},${p.practitioner_id ?? 'N/A'},${p.amount ?? 0},${p.payment_method ?? 'N/A'},${p.status ?? 'N/A'}`
      ).join('\n');

      const header = 'Période,Praticien,Montant,Méthode,Statut\n';
      const blob = new Blob([header + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `reversements-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Export réussi", description: `${payouts.length} reversements exportés` });
    } catch (error) {
      // P3: Wrap console.error with DEV check
      if (import.meta.env.DEV) {
        console.error('Export error:', error);
      }
      toast({
        title: "Erreur d'export",
        description: "Impossible d'exporter les données",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenus totaux
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{(stats?.total_revenue || 0).toLocaleString()} XOF</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Commission plateforme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{(stats?.total_commission || 0).toLocaleString()} XOF</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fonds en rétention (48h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{(stats?.held_amount || 0).toLocaleString()} XOF</div>
            <p className="text-xs text-muted-foreground">En attente de libération</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prêt à reverser
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{(stats?.pending_payouts || 0).toLocaleString()} XOF</div>
            <p className="text-xs text-muted-foreground">Disponible pour versement</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paiements en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pending_payments || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paiements réussis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completed_payments || 0}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Workflow Info Card */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Workflow de reversement :</span>
              <Badge variant="outline">1. Patient paie</Badge>
              <span>→</span>
              <Badge variant="secondary">2. Fonds retenus 48h</Badge>
              <span>→</span>
              <Badge variant="default">3. Release auto</Badge>
              <span>→</span>
              <Badge className="bg-green-600">4. Créer lot</Badge>
              <span>→</span>
              <Badge className="bg-blue-600">5. Exécuter paiement</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="realtime">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9">
          <TabsTrigger value="realtime">Flux temps réel</TabsTrigger>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="payouts">Reversements</TabsTrigger>
          <TabsTrigger value="lots">Lots de Versement</TabsTrigger>
          <TabsTrigger value="release">Release Fonds</TabsTrigger>
          <TabsTrigger value="remboursements">Remboursements</TabsTrigger>
          <TabsTrigger value="reconciliation">Réconciliation</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="events">Événements</TabsTrigger>
        </TabsList>

        <TabsContent value="realtime" className="space-y-4">
          <PaymentFlowsDashboard />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Transactions patients</CardTitle>
                  <CardDescription>Historique des paiements reçus</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={paymentStatusFilter} onValueChange={(value) => {
                    setPaymentStatusFilter(value);
                    setPaymentsPage(1);
                  }}>
                    <SelectTrigger className="w-[150px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filtrer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="paid">Payés</SelectItem>
                      <SelectItem value="failed">Échoués</SelectItem>
                      <SelectItem value="cancelled">Annulés</SelectItem>
                      <SelectItem value="refunded">Remboursés</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => refetchPayments()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPayments}>
                    <Download className="h-4 w-4 mr-2" />
                    Exporter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : payments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune transaction
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Praticien</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment: any) => (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(payment.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{payment.patient?.full_name || 'Patient inconnu'}</p>
                            {payment.patient?.phone && (
                              <p className="text-xs text-muted-foreground">{payment.patient.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{payment.appointment?.practitioner_name || 'N/A'}</p>
                            {payment.appointment?.specialty && (
                              <p className="text-xs text-muted-foreground">{payment.appointment.specialty}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {payment.amount.toLocaleString()} {payment.currency}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.payment_method?.toUpperCase() || 'N/A'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(payment.status)}>
                            {paymentStatusLabels[payment.status] || payment.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              
              {/* Pagination */}
              {!paymentsLoading && payments.length > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Affichage {(paymentsPage - 1) * limit + 1} à {Math.min(paymentsPage * limit, paymentsTotal)} sur {paymentsTotal}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPaymentsPage(p => Math.max(1, p - 1))}
                      disabled={paymentsPage === 1}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPaymentsPage(p => p + 1)}
                      disabled={paymentsPage * limit >= paymentsTotal}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Reversements praticiens</CardTitle>
                  <CardDescription>Paiements aux praticiens</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExportPayouts}>
                  <Download className="h-4 w-4 mr-2" />
                  Exporter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {payoutsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : payouts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun reversement
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Période</TableHead>
                      <TableHead>Praticien</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date traitement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout: any) => (
                      <TableRow key={payout.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(payout.period_start).toLocaleDateString('fr-FR')} - {' '}
                          {new Date(payout.period_end).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{payout.practitioner?.name || 'Praticien inconnu'}</p>
                            {payout.practitioner?.phone && (
                              <p className="text-xs text-muted-foreground">{payout.practitioner.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {payout.amount.toLocaleString()} {payout.currency}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {payout.payment_method === 'momo' ? 'Mobile Money' : payout.payment_method === 'bank' ? 'Virement' : payout.payment_method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(payout.status)}>
                            {payoutStatusLabels[payout.status] || payout.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {payout.processed_at
                            ? new Date(payout.processed_at).toLocaleDateString('fr-FR')
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              
              {/* Pagination */}
              {!payoutsLoading && payouts.length > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Affichage {(payoutsPage - 1) * limit + 1} à {Math.min(payoutsPage * limit, payoutsTotal)} sur {payoutsTotal}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPayoutsPage(p => Math.max(1, p - 1))}
                      disabled={payoutsPage === 1}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPayoutsPage(p => p + 1)}
                      disabled={payoutsPage * limit >= payoutsTotal}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lots">
          <PayoutsManagementSection />
        </TabsContent>

        <TabsContent value="release">
          <FundsReleaseSection />
        </TabsContent>

        <TabsContent value="remboursements">
          <RefundsSection />
        </TabsContent>

        <TabsContent value="reconciliation">
          <ReconciliationSection />
        </TabsContent>

        <TabsContent value="webhooks">
          <WebhooksSection />
        </TabsContent>

        <TabsContent value="events">
          <PaymentEventsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
