import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Download, TrendingUp, Wallet, Clock, FileText, Calendar } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatAmount, PAYOUT_STATUS_LABELS } from "@/lib/payment-config";
import logoImage from "@/assets/logo.png";
import QRCode from "qrcode";

interface PayoutsSectionProps {
  practitionerId: string;
}

type PractitionerBalance = {
  balance_available: number;
  balance_pending: number;
  balance_on_hold: number;
  currency: string;
  last_payout_at: string | null;
};

type PaymentWithAppointment = {
  id: string;
  amount: number;
  commission_amount: number | null;
  fees_amount: number | null;
  gateway_fees_amount: number | null;
  net_amount: number | null;
  status: string;
  payout_status: string | null;
  created_at: string;
  appointment_id: string;
  patient_id: string;
  currency: string;
  payer_name: string | null;
};

export default function PayoutsSection({ practitionerId }: PayoutsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [balanceUpdate, setBalanceUpdate] = useState<string | null>(null);
  const [paymentsLimit, setPaymentsLimit] = useState(20);
  const [payoutsLimit, setPayoutsLimit] = useState(20);
  const [periodFilter, setPeriodFilter] = useState<'all' | '3months' | '6months' | '12months'>('all');

  // Fetch practitioner balance with maybeSingle to handle missing data
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["practitioner-balance", practitionerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioner_balances")
        .select("*")
        .eq("practitioner_id", practitionerId)
        .maybeSingle();
      
      if (error) throw error;
      return data as PractitionerBalance | null;
    },
  });

  // Realtime updates pour la balance praticien
  useEffect(() => {
    if (!practitionerId) return;

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
          queryClient.invalidateQueries({ queryKey: ['practitioner-balance', practitionerId] });
          
          if (payload.eventType === 'UPDATE') {
            const newBalance = payload.new as PractitionerBalance;
            setBalanceUpdate(`Nouveau solde: ${formatAmount(newBalance.balance_available)} XOF`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [practitionerId, queryClient]);

  // Toast notification for balance updates
  useEffect(() => {
    if (balanceUpdate) {
      toast({
        title: "Balance mise à jour",
        description: balanceUpdate,
      });
      setBalanceUpdate(null);
    }
  }, [balanceUpdate, toast]);

  // Calculate date filter
  const dateFilter = useMemo(() => {
    if (periodFilter === 'all') return null;
    const months = periodFilter === '3months' ? 3 : periodFilter === '6months' ? 6 : 12;
    return subMonths(new Date(), months).toISOString();
  }, [periodFilter]);

  // Fetch payments using payout_payments junction table for accurate practitioner filtering
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["practitioner-payments", practitionerId, paymentsLimit, dateFilter],
    queryFn: async () => {
      // First get payments via appointments that belong to this practitioner
      let query = supabase
        .from("payments")
        .select(`
          id,
          amount,
          commission_amount,
          fees_amount,
          gateway_fees_amount,
          net_amount,
          status,
          payout_status,
          created_at,
          appointment_id,
          patient_id,
          currency,
          payer_name
        `)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(paymentsLimit);
      
      if (dateFilter) {
        query = query.gte("created_at", dateFilter);
      }
      
      const { data: allPayments, error: paymentsError } = await query;
      if (paymentsError) throw paymentsError;

      // Filter payments that belong to this practitioner via appointments
      if (!allPayments || allPayments.length === 0) return [];

      const appointmentIds = allPayments.map(p => p.appointment_id);
      const { data: practitionerAppointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select("id")
        .eq("practitioner_id", practitionerId)
        .in("id", appointmentIds);

      if (appointmentsError) throw appointmentsError;

      const validAppointmentIds = new Set(practitionerAppointments?.map(a => a.id) || []);
      return allPayments.filter(p => validAppointmentIds.has(p.appointment_id)) as PaymentWithAppointment[];
    },
  });

  // Fetch payouts history
  const { data: payouts, isLoading: payoutsLoading } = useQuery({
    queryKey: ["practitioner-payouts", practitionerId, payoutsLimit, dateFilter],
    queryFn: async () => {
      let query = supabase
        .from("practitioner_payouts")
        .select("*")
        .eq("practitioner_id", practitionerId)
        .order("created_at", { ascending: false })
        .limit(payoutsLimit);
      
      if (dateFilter) {
        query = query.gte("created_at", dateFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Calculate total statistics
  const stats = useMemo(() => {
    if (!payments) return { totalRevenue: 0, totalCommissions: 0, totalFees: 0, totalNet: 0, paidCount: 0 };
    
    return payments.reduce((acc, payment) => ({
      totalRevenue: acc.totalRevenue + (payment.amount || 0),
      totalCommissions: acc.totalCommissions + (payment.commission_amount || 0),
      totalFees: acc.totalFees + (payment.fees_amount || 0) + (payment.gateway_fees_amount || 0),
      totalNet: acc.totalNet + (payment.net_amount || 0),
      paidCount: acc.paidCount + 1,
    }), { totalRevenue: 0, totalCommissions: 0, totalFees: 0, totalNet: 0, paidCount: 0 });
  }, [payments]);

  // Prepare chart data for revenue evolution - FIXED: sort chronologically
  const revenueChartData = useMemo(() => {
    if (!payments) return [];
    
    const monthlyData: Record<string, { month: string; date: Date; montant: number; commission: number }> = {};
    
    payments.forEach(payment => {
      const date = new Date(payment.created_at);
      const monthKey = format(date, "yyyy-MM");
      const monthLabel = format(date, "MMM yyyy", { locale: fr });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthLabel,
          date: startOfMonth(date),
          montant: 0,
          commission: 0,
        };
      }
      
      monthlyData[monthKey].montant += payment.net_amount || 0;
      monthlyData[monthKey].commission += payment.commission_amount || 0;
    });
    
    // Sort by date ascending for proper chart display
    return Object.values(monthlyData).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [payments]);

  // Prepare payment status distribution
  const pieChartData = useMemo(() => {
    if (!payments) return [];
    
    const statusDistribution = payments.reduce((acc: Record<string, number>, payment) => {
      const status = payment.payout_status || "pending";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(statusDistribution).map(([status, count]) => ({
      name: PAYOUT_STATUS_LABELS[status as keyof typeof PAYOUT_STATUS_LABELS] || status,
      value: count,
    }));
  }, [payments]);

  const COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6"];

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

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Generate secure hash
      const timestamp = new Date().toISOString();
      const dataToHash = `${practitionerId}-${timestamp}-${stats.totalNet}`;
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataToHash));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();
      
      // Generate QR code
      const verificationUrl = `${window.location.origin}/verify-report/${hashHex}`;
      const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, { width: 60, margin: 1 });
      
      // Add logo
      const img = new Image();
      img.src = logoImage;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      
      try {
        doc.addImage(img, 'PNG', 14, 10, 40, 15);
      } catch {
        doc.setFontSize(16);
        doc.setTextColor(0, 102, 204);
        doc.text("DOMICARES", 14, 20);
      }
      
      // Company info
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text("Domicares - Soins à domicile", 60, 12);
      doc.text("Cotonou, Bénin", 60, 16);
      doc.text("contact@domicares.com", 60, 20);
      
      // QR Code
      doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - 35, 8, 25, 25);
      
      // Title
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text("Rapport de Revenus", 14, 42);
      
      // Date and verification code
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Généré le ${format(new Date(), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}`, 14, 48);
      doc.text(`Code de vérification: ${hashHex}`, 14, 53);
      
      // Separator line
      doc.setDrawColor(200);
      doc.line(14, 58, pageWidth - 14, 58);
      
      // Balance summary
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text("Résumé Financier", 14, 68);
      
      doc.setFontSize(10);
      doc.text(`Solde disponible: ${formatAmount(balance?.balance_available || 0)}`, 14, 76);
      doc.text(`En attente: ${formatAmount(balance?.balance_pending || 0)}`, 14, 82);
      doc.text(`En rétention: ${formatAmount(balance?.balance_on_hold || 0)}`, 14, 88);
      
      doc.text(`Total revenus bruts: ${formatAmount(stats.totalRevenue)}`, 100, 76);
      doc.text(`Total commissions: ${formatAmount(stats.totalCommissions)}`, 100, 82);
      doc.text(`Total net: ${formatAmount(stats.totalNet)}`, 100, 88);
      
      // Payments table
      if (payments && payments.length > 0) {
        doc.setFontSize(12);
        doc.text("Historique des Paiements", 14, 100);
        
        autoTable(doc, {
          startY: 105,
          head: [["Date", "Patient", "Montant", "Commission", "Net", "Statut"]],
          body: payments.slice(0, 50).map(payment => [
            format(new Date(payment.created_at), "dd/MM/yyyy", { locale: fr }),
            payment.payer_name || "Patient",
            formatAmount(payment.amount),
            `-${formatAmount(payment.commission_amount || 0)}`,
            formatAmount(payment.net_amount || 0),
            PAYOUT_STATUS_LABELS[payment.payout_status as keyof typeof PAYOUT_STATUS_LABELS] || payment.payout_status || "En attente",
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [0, 102, 204] },
        });
      }
      
      // Payouts table if space allows
      const currentY = (doc as any).lastAutoTable?.finalY || 105;
      if (payouts && payouts.length > 0 && currentY < 220) {
        doc.setFontSize(12);
        doc.text("Historique des Reversements", 14, currentY + 15);
        
        autoTable(doc, {
          startY: currentY + 20,
          head: [["Date", "Période", "Montant", "Méthode", "Statut"]],
          body: payouts.slice(0, 20).map(payout => [
            format(new Date(payout.created_at!), "dd/MM/yyyy", { locale: fr }),
            payout.period_start && payout.period_end 
              ? `${format(new Date(payout.period_start), "dd/MM", { locale: fr })} - ${format(new Date(payout.period_end), "dd/MM/yyyy", { locale: fr })}`
              : "N/A",
            formatAmount(payout.amount),
            payout.payment_method || "N/A",
            PAYOUT_STATUS_LABELS[payout.status as keyof typeof PAYOUT_STATUS_LABELS] || payout.status,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [0, 102, 204] },
        });
      }
      
      // Footer
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Document généré automatiquement par Domicares", 14, pageHeight - 15);
      doc.text(`Vérification: ${hashHex}`, 14, pageHeight - 10);
      
      doc.save(`rapport-revenus-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      
      toast({
        title: "Export réussi",
        description: "Le rapport PDF a été téléchargé.",
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Erreur d'export",
        description: "Impossible de générer le PDF",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Période:</span>
          <div className="flex gap-1">
            {[
              { value: 'all', label: 'Tout' },
              { value: '3months', label: '3 mois' },
              { value: '6months', label: '6 mois' },
              { value: '12months', label: '12 mois' },
            ].map((option) => (
              <Button
                key={option.value}
                variant={periodFilter === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriodFilter(option.value as typeof periodFilter)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <Button onClick={exportToPDF} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exporter en PDF
        </Button>
      </div>

      {/* Balance Overview */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Solde disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {balanceLoading ? "..." : formatAmount(balance?.balance_available || 0)}
            </div>
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
            <div className="text-2xl font-bold">
              {balanceLoading ? "..." : formatAmount(balance?.balance_pending || 0)}
            </div>
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
            <div className="text-2xl font-bold">
              {balanceLoading ? "..." : formatAmount(balance?.balance_on_hold || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total revenus nets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {paymentsLoading ? "..." : formatAmount(stats.totalNet)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.paidCount} paiement(s)
            </p>
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

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Évolution des Revenus</CardTitle>
            <CardDescription>Montants nets par mois (ordre chronologique)</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatAmount(Number(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="montant" stroke="hsl(var(--primary))" name="Montant Net" strokeWidth={2} />
                  <Line type="monotone" dataKey="commission" stroke="hsl(var(--destructive))" name="Commission" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par Statut</CardTitle>
            <CardDescription>Distribution des paiements</CardDescription>
          </CardHeader>
          <CardContent>
            {pieChartData.length > 0 ? (
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
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Aucune donnée disponible
              </div>
            )}
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
                    <TableHead>Patient</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Frais</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Chargement...
                      </TableCell>
                    </TableRow>
                  ) : payments && payments.length > 0 ? (
                    payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{format(new Date(payment.created_at), "dd/MM/yyyy", { locale: fr })}</TableCell>
                        <TableCell>{payment.payer_name || "Patient"}</TableCell>
                        <TableCell>{formatAmount(payment.amount)}</TableCell>
                        <TableCell className="text-destructive">-{formatAmount(payment.commission_amount || 0)}</TableCell>
                        <TableCell className="text-destructive">-{formatAmount((payment.fees_amount || 0) + (payment.gateway_fees_amount || 0))}</TableCell>
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
              {payments && payments.length >= paymentsLimit && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setPaymentsLimit(prev => prev + 20)}
                  >
                    Voir plus
                  </Button>
                </div>
              )}
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
                  {payoutsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Chargement...
                      </TableCell>
                    </TableRow>
                  ) : payouts && payouts.length > 0 ? (
                    payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell>{format(new Date(payout.created_at!), "dd/MM/yyyy", { locale: fr })}</TableCell>
                        <TableCell>
                          {payout.period_start && payout.period_end 
                            ? `${format(new Date(payout.period_start), "dd/MM", { locale: fr })} - ${format(new Date(payout.period_end), "dd/MM/yyyy", { locale: fr })}`
                            : "N/A"}
                        </TableCell>
                        <TableCell className="font-bold">{formatAmount(payout.amount)}</TableCell>
                        <TableCell>{payout.payment_method || "N/A"}</TableCell>
                        <TableCell>{getPayoutStatusBadge(payout.status || "pending")}</TableCell>
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
              {payouts && payouts.length >= payoutsLimit && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setPayoutsLimit(prev => prev + 20)}
                  >
                    Voir plus
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
