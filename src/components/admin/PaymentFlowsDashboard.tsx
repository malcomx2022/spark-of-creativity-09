import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, onTableChange } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, Clock, Wallet } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Legend } from "recharts";

interface PractitionerBalance {
  practitioner_id: string;
  balance_pending: number;
  balance_on_hold: number;
  balance_available: number;
  currency: string;
  updated_at: string;
}

interface PractitionerPayout {
  id: string;
  practitioner_id: string;
  amount: number;
  currency: string | null;
  status: string | null;
  payment_method: string;
  created_at: string | null;
  processed_at: string | null;
}

interface Payment {
  id: string;
  patient_id: string;
  amount: number;
  currency: string;
  status: string;
  payout_status: string | null;
  fedapay_transaction_id: string | null;
  fedapay_payment_url: string | null;
  payment_method: string;
  created_at: string;
}

const FEDAPAY_STATUSES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "En attente", variant: "secondary" },
  initiated: { label: "Initiée", variant: "secondary" },
  processing: { label: "Traitement", variant: "outline" },
  paid: { label: "Payée", variant: "default" },
  completed: { label: "Confirmée", variant: "default" },
  failed: { label: "Échouée", variant: "destructive" },
  canceled: { label: "Annulée", variant: "outline" },
  cancelled: { label: "Annulée", variant: "outline" },
  refunded: { label: "Remboursée", variant: "outline" },
};

const PAYOUT_STATUSES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planned: { label: "Planifié", variant: "secondary" },
  queued: { label: "File d'attente", variant: "secondary" },
  processing: { label: "En traitement", variant: "outline" },
  sent: { label: "Envoyé", variant: "default" },
  completed: { label: "Terminé", variant: "default" },
  failed: { label: "Échec", variant: "destructive" },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  momo: "Mobile Money",
  card: "Carte bancaire",
  cash: "Espèces",
  bank: "Virement bancaire",
};

const formatCurrency = (value: number, currency = "XOF") =>
  `${value.toLocaleString("fr-FR")} ${currency}`;

export function PaymentFlowsDashboard() {
  const queryClient = useQueryClient();

  const { data: balances = [], isLoading: balancesLoading } = useQuery<PractitionerBalance[]>({
    queryKey: ["admin-payment-balances"],
    queryFn: async () => {
      const rows = await api.get<PractitionerBalance[]>("/admin/finance/balances");
      return [...rows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    },
  });

  const { data: payouts = [], isLoading: payoutsLoading } = useQuery<PractitionerPayout[]>({
    queryKey: ["admin-active-payouts"],
    queryFn: async () => {
      // Reversements en cours parmi les 100 derniers (l'API ne filtre que sur un statut à la fois)
      const res = await api.get<{ data: PractitionerPayout[] }>("/admin/finance/payouts", { query: { limit: 100 } });
      const active = ["planned", "queued", "processing", "sent"];
      return res.data.filter((p) => active.includes(p.status ?? "")).slice(0, 25);
    },
  });

  const { data: fedapayTransactions = [], isLoading: fedapayLoading } = useQuery<Payment[]>({
    queryKey: ["admin-fedapay-transactions"],
    queryFn: async () => {
      // Dernières transactions FedaPay parmi les 100 derniers paiements
      const res = await api.get<{ data: Payment[] }>("/admin/finance/payments", { query: { limit: 100 } });
      return res.data.filter((p) => p.fedapay_transaction_id).slice(0, 30);
    },
  });

  useEffect(() => {
    // Temps réel : l'API diffuse les changements de ces tables aux administrateurs
    return onTableChange(["practitioner_balances", "practitioner_payouts", "payments"], (event) => {
      if (event.table === "practitioner_balances") queryClient.invalidateQueries({ queryKey: ["admin-payment-balances"] });
      else if (event.table === "practitioner_payouts") queryClient.invalidateQueries({ queryKey: ["admin-active-payouts"] });
      else queryClient.invalidateQueries({ queryKey: ["admin-fedapay-transactions"] });
    });
  }, [queryClient]);

  const balanceTotals = useMemo(() => {
    return balances.reduce(
      (acc, balance) => {
        acc.pending += balance.balance_pending;
        acc.onHold += balance.balance_on_hold;
        acc.available += balance.balance_available;
        return acc;
      },
      { pending: 0, onHold: 0, available: 0 }
    );
  }, [balances]);

  const balanceChartData = useMemo(
    () => [
      { name: "En attente", value: balanceTotals.pending },
      { name: "En hold", value: balanceTotals.onHold },
      { name: "Disponible", value: balanceTotals.available },
    ],
    [balanceTotals]
  );

  const balanceTimelineData = useMemo(() => {
    const grouped = balances.reduce<Record<string, { date: string; pending: number; onHold: number; available: number; timestamp: number }>>((acc, balance) => {
      const dateKey = new Date(balance.updated_at).toISOString().slice(0, 10);
      const timestamp = new Date(balance.updated_at).getTime();

      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: format(new Date(balance.updated_at), "dd MMM", { locale: fr }),
          pending: 0,
          onHold: 0,
          available: 0,
          timestamp,
        };
      }

      acc[dateKey].pending += balance.balance_pending;
      acc[dateKey].onHold += balance.balance_on_hold;
      acc[dateKey].available += balance.balance_available;
      acc[dateKey].timestamp = Math.max(acc[dateKey].timestamp, timestamp);
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-7);
  }, [balances]);

  const renderPayoutStatus = (status: string | null) => {
    if (!status) {
      return <Badge variant="outline">Inconnu</Badge>;
    }

    const config = PAYOUT_STATUSES[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const renderPaymentStatus = (status: string) => {
    const config = FEDAPAY_STATUSES[status] || { label: status, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const fedapayStatusSummary = useMemo(() => {
    return fedapayTransactions.reduce<Record<string, number>>((acc, transaction) => {
      acc[transaction.status] = (acc[transaction.status] || 0) + 1;
      return acc;
    }, {});
  }, [fedapayTransactions]);

  return (
    <div className="space-y-6">
      <Card className="shadow-medical">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Flux de paiement en temps réel</CardTitle>
              <CardDescription>
                Visualisez l&apos;évolution des soldes et surveillez les transactions clés de la plateforme.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Mise à jour automatique
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Solde en attente</span>
                <Clock className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(balanceTotals.pending)}</p>
              <p className="text-xs text-muted-foreground">Fonds en attente de confirmation</p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Solde en hold</span>
                <Activity className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(balanceTotals.onHold)}</p>
              <p className="text-xs text-muted-foreground">Consultations en cours de finalisation</p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Solde disponible</span>
                <Wallet className="h-4 w-4" />
              </div>
              <p className="mt-2 text-2xl font-semibold">{formatCurrency(balanceTotals.available)}</p>
              <p className="text-xs text-muted-foreground">Prêt pour reversement</p>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-none border border-dashed">
              <CardHeader>
                <CardTitle>Répartition des soldes</CardTitle>
                <CardDescription>Montants agrégés par statut financier</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {balancesLoading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Chargement des soldes...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={balanceChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Montant" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-none border border-dashed">
              <CardHeader>
                <CardTitle>Tendance sur 7 jours</CardTitle>
                <CardDescription>Évolution globale des soldes agrégés</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {balancesLoading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Calcul des tendances...
                  </div>
                ) : balanceTimelineData.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                    Aucune donnée historique disponible.
                    <span>Les tendances apparaîtront dès que des soldes seront mis à jour.</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={balanceTimelineData}>
                      <defs>
                        <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="colorHold" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="colorAvailable" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Area type="monotone" dataKey="pending" stroke="hsl(var(--chart-1))" fill="url(#colorPending)" name="En attente" />
                      <Area type="monotone" dataKey="onHold" stroke="hsl(var(--chart-2))" fill="url(#colorHold)" name="En hold" />
                      <Area type="monotone" dataKey="available" stroke="hsl(var(--chart-3))" fill="url(#colorAvailable)" name="Disponible" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-medical">
          <CardHeader>
            <CardTitle>Reversements en cours</CardTitle>
            <CardDescription>Suivi en temps réel des versements en préparation</CardDescription>
          </CardHeader>
          <CardContent>
            {payoutsLoading ? (
              <div className="py-6 text-center text-muted-foreground">Chargement des reversements...</div>
            ) : payouts.length === 0 ? (
              <Alert className="border-dashed">
                <AlertTitle>Aucun reversement actif</AlertTitle>
                <AlertDescription>
                  Aucun lot de versement n&apos;est actuellement en cours de traitement. Les prochains reversements apparaîtront ici automatiquement.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Praticien</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Créé le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="font-mono text-xs">{payout.practitioner_id.slice(0, 8)}...</TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(payout.amount, payout.currency || "XOF")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{PAYMENT_METHOD_LABELS[payout.payment_method] || payout.payment_method}</Badge>
                        </TableCell>
                        <TableCell>{renderPayoutStatus(payout.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payout.created_at ? format(new Date(payout.created_at), "dd MMM yyyy", { locale: fr }) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-medical">
          <CardHeader>
            <CardTitle>Transactions FedaPay</CardTitle>
            <CardDescription>Dernières transactions synchronisées avec la passerelle FedaPay</CardDescription>
          </CardHeader>
          <CardContent>
            {fedapayLoading ? (
              <div className="py-6 text-center text-muted-foreground">Chargement des transactions FedaPay...</div>
            ) : fedapayTransactions.length === 0 ? (
              <Alert className="border-dashed">
                <AlertTitle>Aucune transaction disponible</AlertTitle>
                <AlertDescription>
                  Les transactions FedaPay apparaîtront dès qu&apos;une nouvelle opération sera enregistrée sur la plateforme.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(fedapayStatusSummary).map(([status, count]) => {
                    const config = FEDAPAY_STATUSES[status] || { label: status, variant: "outline" as const };

                    return (
                      <Badge key={status} variant={config.variant} className="flex items-center gap-2">
                        <span>{config.label}</span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold">
                          {count}
                        </span>
                      </Badge>
                    );
                  })}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transaction</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Payout</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fedapayTransactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-mono text-xs">
                            {transaction.fedapay_transaction_id?.slice(0, 10) || "N/A"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{transaction.patient_id.slice(0, 8)}...</TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </TableCell>
                          <TableCell>{renderPaymentStatus(transaction.status)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{transaction.payout_status || "-"}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(transaction.created_at), "dd MMM yyyy HH:mm", { locale: fr })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PaymentFlowsDashboard;
