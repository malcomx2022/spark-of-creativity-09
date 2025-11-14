import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Download, TrendingUp, Wallet, Clock, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatAmount, PAYMENT_STATUS_LABELS, PAYOUT_STATUS_LABELS } from "@/lib/payment-config";

interface PayoutsSectionProps {
  practitionerId: string;
}

export default function PayoutsSection({ practitionerId }: PayoutsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch practitioner balance
  const { data: balance } = useQuery({
    queryKey: ["practitioner-balance", practitionerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioner_balances")
        .select("*")
        .eq("practitioner_id", practitionerId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Realtime updates pour la balance praticien
  useEffect(() => {
    if (!practitionerId) return;

    console.log('🔄 Configuration realtime balance praticien:', practitionerId);

    const channel = supabase
      .channel('practitioner-balance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practitioner_balances',
          filter: `practitioner_id=eq.${practitionerId}`,
        },
        (payload) => {
          console.log('💰 Balance mise à jour:', payload);
          queryClient.invalidateQueries({ queryKey: ['practitioner-balance', practitionerId] });
          
          // Afficher notification à l'utilisateur - utilise setTimeout pour éviter l'erreur React #310
          if (payload.eventType === 'UPDATE') {
            const newBalance = payload.new as any;
            setTimeout(() => {
              toast({
                title: "Balance mise à jour",
                description: `Nouveau solde: ${formatAmount(newBalance.balance_available)} XOF`,
              });
            }, 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [practitionerId, queryClient]);

  // Fetch payments history
  const { data: payments } = useQuery({
    queryKey: ["practitioner-payments", practitionerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          appointments!inner(practitioner_id)
        `)
        .eq("appointments.practitioner_id", practitionerId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch payouts history
  const { data: payouts } = useQuery({
    queryKey: ["practitioner-payouts", practitionerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioner_payouts")
        .select("*")
        .eq("practitioner_id", practitionerId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Prepare chart data for revenue evolution
  const revenueChartData = payments?.reduce((acc: any[], payment) => {
    const month = format(new Date(payment.created_at), "MMM yyyy", { locale: fr });
    const existing = acc.find(item => item.month === month);
    
    if (existing) {
      existing.montant += payment.net_amount || 0;
      existing.commission += payment.commission_amount || 0;
    } else {
      acc.push({
        month,
        montant: payment.net_amount || 0,
        commission: payment.commission_amount || 0,
      });
    }
    return acc;
  }, []) || [];

  // Prepare payment status distribution
  const statusDistribution = payments?.reduce((acc: any, payment) => {
    const status = payment.payout_status || "pending";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {}) || {};

  const pieChartData = Object.entries(statusDistribution).map(([status, count]) => ({
    name: PAYOUT_STATUS_LABELS[status as keyof typeof PAYOUT_STATUS_LABELS] || status,
    value: count,
  }));

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

  const getPayoutStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "En attente" },
      processing: { variant: "outline", label: "En cours" },
      completed: { variant: "default", label: "Complété" },
      failed: { variant: "destructive", label: "Échoué" },
    };
    const { variant, label } = config[status] || config.pending;
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getPaymentStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "En attente" },
      held: { variant: "outline", label: "En rétention" },
      ready: { variant: "outline", label: "Prêt" },
      paid: { variant: "default", label: "Versé" },
      failed: { variant: "destructive", label: "Échoué" },
    };
    const { variant, label } = config[status] || config.pending;
    return <Badge variant={variant}>{label}</Badge>;
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text("Rapport de Reversements", 14, 22);
    
    // Date
    doc.setFontSize(11);
    doc.text(`Généré le ${format(new Date(), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}`, 14, 30);
    
    // Balance summary
    doc.setFontSize(14);
    doc.text("Résumé du Solde", 14, 45);
    doc.setFontSize(11);
    doc.text(`Disponible: ${formatAmount(balance?.balance_available || 0)}`, 14, 53);
    doc.text(`En attente: ${formatAmount(balance?.balance_pending || 0)}`, 14, 60);
    doc.text(`En rétention: ${formatAmount(balance?.balance_on_hold || 0)}`, 14, 67);
    
    // Payouts table
    if (payouts && payouts.length > 0) {
      autoTable(doc, {
        startY: 75,
        head: [["Date", "Période", "Montant", "Statut"]],
        body: payouts.map(payout => [
          format(new Date(payout.created_at), "dd/MM/yyyy", { locale: fr }),
          payout.period_start && payout.period_end 
            ? `${format(new Date(payout.period_start), "dd/MM", { locale: fr })} - ${format(new Date(payout.period_end), "dd/MM/yyyy", { locale: fr })}`
            : "N/A",
          formatAmount(payout.amount),
          PAYOUT_STATUS_LABELS[payout.status as keyof typeof PAYOUT_STATUS_LABELS] || payout.status,
        ]),
      });
    }
    
    doc.save(`rapport-reversements-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    
    toast({
      title: "Export réussi",
      description: "Le rapport PDF a été téléchargé.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Balance Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Solde disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(balance?.balance_available || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              En attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(balance?.balance_pending || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              En rétention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(balance?.balance_on_hold || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Dernier versement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">
              {balance?.last_payout_at 
                ? format(new Date(balance.last_payout_at), "dd MMM yyyy", { locale: fr })
                : "Aucun"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export PDF Button */}
      <div className="flex justify-end">
        <Button onClick={exportToPDF} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exporter en PDF
        </Button>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Évolution des Revenus</CardTitle>
            <CardDescription>Montants nets par mois</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatAmount(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="montant" stroke="#8884d8" name="Montant Net" />
                <Line type="monotone" dataKey="commission" stroke="#82ca9d" name="Commission" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par Statut</CardTitle>
            <CardDescription>Distribution des paiements</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Payments and Payouts */}
      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payments">Paiements ({payments?.length || 0})</TabsTrigger>
          <TabsTrigger value="payouts">Reversements ({payouts?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Paiements</CardTitle>
              <CardDescription>Tous les paiements reçus pour vos consultations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Rendez-vous</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Frais</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments && payments.length > 0 ? (
                    payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{format(new Date(payment.created_at), "dd/MM/yyyy", { locale: fr })}</TableCell>
                        <TableCell className="font-mono text-xs">{payment.appointment_id.slice(0, 8)}...</TableCell>
                        <TableCell>{formatAmount(payment.amount)}</TableCell>
                        <TableCell className="text-destructive">-{formatAmount(payment.commission_amount || 0)}</TableCell>
                        <TableCell className="text-destructive">-{formatAmount(payment.fees_amount || 0)}</TableCell>
                        <TableCell className="font-bold">{formatAmount(payment.net_amount || 0)}</TableCell>
                        <TableCell>{getPaymentStatusBadge(payment.payout_status || "pending")}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Aucun paiement trouvé
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Reversements</CardTitle>
              <CardDescription>Tous vos reversements effectués</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Période</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Traité le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts && payouts.length > 0 ? (
                    payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell>{format(new Date(payout.created_at), "dd/MM/yyyy", { locale: fr })}</TableCell>
                        <TableCell>
                          {payout.period_start && payout.period_end 
                            ? `${format(new Date(payout.period_start), "dd/MM", { locale: fr })} - ${format(new Date(payout.period_end), "dd/MM/yyyy", { locale: fr })}`
                            : "N/A"}
                        </TableCell>
                        <TableCell className="font-bold">{formatAmount(payout.amount)}</TableCell>
                        <TableCell>{payout.payment_method || "N/A"}</TableCell>
                        <TableCell>{getPayoutStatusBadge(payout.status)}</TableCell>
                        <TableCell>
                          {payout.processed_at 
                            ? format(new Date(payout.processed_at), "dd/MM/yyyy", { locale: fr })
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Aucun reversement trouvé
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}