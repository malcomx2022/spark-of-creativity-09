import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download } from 'lucide-react';
import { PayoutsManagementSection } from './PayoutsManagementSection';
import { RefundsSection } from './RefundsSection';
import { WebhooksSection } from './WebhooksSection';
import { PaymentEventsSection } from './PaymentEventsSection';
import { FundsReleaseSection } from './FundsReleaseSection';

export function FinanceSection() {
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  const { data: payouts = [], isLoading: payoutsLoading } = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioner_payouts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  const stats = {
    totalRevenue: payments.filter(p => p.status === 'completed' || p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
    pendingPayments: payments.filter(p => p.status === 'pending').length,
    completedPayments: payments.filter(p => p.status === 'completed' || p.status === 'paid').length,
    pendingPayouts: payouts.filter(p => p.status === 'planned').reduce((sum, p) => sum + p.amount, 0),
  };

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

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenus totaux
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRevenue.toLocaleString()} XOF</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paiements en attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingPayments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Paiements complétés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedPayments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reversements à effectuer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingPayouts.toLocaleString()} XOF</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payments">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7">
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="payouts">Reversements</TabsTrigger>
          <TabsTrigger value="lots">Lots de Versement</TabsTrigger>
          <TabsTrigger value="release">Release Fonds</TabsTrigger>
          <TabsTrigger value="remboursements">Remboursements</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="events">Événements</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Transactions patients</CardTitle>
                  <CardDescription>Historique des paiements reçus</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exporter
                </Button>
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
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>RDV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(payment.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>{payment.patient_id.slice(0, 8)}...</TableCell>
                        <TableCell className="font-medium">
                          {payment.amount.toLocaleString()} {payment.currency}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.payment_method.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(payment.status)}>
                            {payment.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {payment.appointment_id.slice(0, 8)}...
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                <Button variant="outline" size="sm">
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
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(payout.period_start).toLocaleDateString('fr-FR')} - {' '}
                          {new Date(payout.period_end).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>{payout.practitioner_id.slice(0, 8)}...</TableCell>
                        <TableCell className="font-medium">
                          {payout.amount.toLocaleString()} {payout.currency}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{payout.payment_method}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(payout.status)}>
                            {payout.status}
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
