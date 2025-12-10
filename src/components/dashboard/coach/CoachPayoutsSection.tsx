import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Download, TrendingUp, Wallet, Clock, FileText, Calendar, Users } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatAmount, PAYOUT_STATUS_LABELS } from "@/lib/payment-config";
import logoImage from "@/assets/logo.png";
import QRCode from "qrcode";

interface CoachPayoutsSectionProps {
  coachId: string;
  coachName: string;
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
  net_amount: number | null;
  status: string;
  payout_status: string | null;
  created_at: string;
  appointment_id: string;
  patient_id: string;
  currency: string;
  payer_name: string | null;
};

type GroupSessionPayment = {
  id: string;
  session_id: string;
  session_name: string;
  patient_id: string;
  payment_status: string;
  joined_at: string;
  price_per_person: number;
  scheduled_date: string;
};

const COACH_COMMISSION_RATE = 0.37; // 37% commission plateforme

export default function CoachPayoutsSection({ coachId, coachName }: CoachPayoutsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [balanceUpdate, setBalanceUpdate] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<'all' | '3months' | '6months' | '12months'>('all');

  // Fetch coach balance
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["coach-balance", coachId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioner_balances")
        .select("*")
        .eq("practitioner_id", coachId)
        .maybeSingle();
      
      if (error) throw error;
      return data as PractitionerBalance | null;
    },
  });

  // Realtime updates for balance
  useEffect(() => {
    if (!coachId) return;

    const channel = supabase
      .channel('coach-balance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practitioner_balances',
          filter: `practitioner_id=eq.${coachId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['coach-balance', coachId] });
          
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
  }, [coachId, queryClient]);

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

  // Fetch individual appointment payments
  const { data: appointmentPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["coach-appointment-payments", coachId, dateFilter],
    queryFn: async () => {
      let query = supabase
        .from("payments")
        .select(`
          id,
          amount,
          commission_amount,
          fees_amount,
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
        .order("created_at", { ascending: false });
      
      if (dateFilter) {
        query = query.gte("created_at", dateFilter);
      }
      
      const { data: allPayments, error: paymentsError } = await query;
      if (paymentsError) throw paymentsError;

      if (!allPayments || allPayments.length === 0) return [];

      const appointmentIds = allPayments.map(p => p.appointment_id);
      const { data: coachAppointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select("id")
        .eq("practitioner_id", coachId)
        .in("id", appointmentIds);

      if (appointmentsError) throw appointmentsError;

      const validAppointmentIds = new Set(coachAppointments?.map(a => a.id) || []);
      return allPayments.filter(p => validAppointmentIds.has(p.appointment_id)) as PaymentWithAppointment[];
    },
  });

  // Fetch group session payments
  const { data: groupSessionPayments = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["coach-group-payments", coachId, dateFilter],
    queryFn: async () => {
      let query = supabase
        .from("group_session_participants")
        .select(`
          id,
          session_id,
          patient_id,
          payment_status,
          joined_at,
          group_sessions!inner (
            id,
            session_name,
            coach_id,
            price_per_person,
            scheduled_date
          )
        `)
        .eq("payment_status", "paid")
        .eq("group_sessions.coach_id", coachId)
        .order("joined_at", { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(item => ({
        id: item.id,
        session_id: item.session_id,
        session_name: (item.group_sessions as any)?.session_name || 'Séance',
        patient_id: item.patient_id,
        payment_status: item.payment_status,
        joined_at: item.joined_at || '',
        price_per_person: (item.group_sessions as any)?.price_per_person || 0,
        scheduled_date: (item.group_sessions as any)?.scheduled_date || '',
      })) as GroupSessionPayment[];
    },
  });

  // Fetch payouts history
  const { data: payouts = [], isLoading: payoutsLoading } = useQuery({
    queryKey: ["coach-payouts", coachId, dateFilter],
    queryFn: async () => {
      let query = supabase
        .from("practitioner_payouts")
        .select("*")
        .eq("practitioner_id", coachId)
        .order("created_at", { ascending: false });
      
      if (dateFilter) {
        query = query.gte("created_at", dateFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate combined statistics
  const stats = useMemo(() => {
    // Appointments revenue
    const appointmentStats = appointmentPayments.reduce((acc, payment) => ({
      totalRevenue: acc.totalRevenue + (payment.amount || 0),
      totalCommissions: acc.totalCommissions + (payment.commission_amount || 0),
      totalNet: acc.totalNet + (payment.net_amount || 0),
      count: acc.count + 1,
    }), { totalRevenue: 0, totalCommissions: 0, totalNet: 0, count: 0 });

    // Group sessions revenue
    const sessionStats = groupSessionPayments.reduce((acc, payment) => {
      const amount = payment.price_per_person;
      const commission = Math.round(amount * COACH_COMMISSION_RATE);
      const net = amount - commission;
      return {
        totalRevenue: acc.totalRevenue + amount,
        totalCommissions: acc.totalCommissions + commission,
        totalNet: acc.totalNet + net,
        count: acc.count + 1,
      };
    }, { totalRevenue: 0, totalCommissions: 0, totalNet: 0, count: 0 });

    return {
      appointments: appointmentStats,
      sessions: sessionStats,
      combined: {
        totalRevenue: appointmentStats.totalRevenue + sessionStats.totalRevenue,
        totalCommissions: appointmentStats.totalCommissions + sessionStats.totalCommissions,
        totalNet: appointmentStats.totalNet + sessionStats.totalNet,
        count: appointmentStats.count + sessionStats.count,
      }
    };
  }, [appointmentPayments, groupSessionPayments]);

  // Prepare chart data
  const revenueChartData = useMemo(() => {
    const monthlyData: Record<string, { month: string; date: Date; appointments: number; sessions: number }> = {};
    
    // Add appointment payments
    appointmentPayments.forEach(payment => {
      const date = new Date(payment.created_at);
      const monthKey = format(date, "yyyy-MM");
      const monthLabel = format(date, "MMM yyyy", { locale: fr });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthLabel,
          date: startOfMonth(date),
          appointments: 0,
          sessions: 0,
        };
      }
      
      monthlyData[monthKey].appointments += payment.net_amount || 0;
    });

    // Add group session payments
    groupSessionPayments.forEach(payment => {
      const date = new Date(payment.joined_at || payment.scheduled_date);
      const monthKey = format(date, "yyyy-MM");
      const monthLabel = format(date, "MMM yyyy", { locale: fr });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthLabel,
          date: startOfMonth(date),
          appointments: 0,
          sessions: 0,
        };
      }
      
      const netAmount = payment.price_per_person * (1 - COACH_COMMISSION_RATE);
      monthlyData[monthKey].sessions += netAmount;
    });
    
    return Object.values(monthlyData).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [appointmentPayments, groupSessionPayments]);

  // Pie chart data
  const pieChartData = useMemo(() => {
    const data = [];
    if (stats.appointments.totalNet > 0) {
      data.push({ name: 'Rendez-vous', value: stats.appointments.totalNet });
    }
    if (stats.sessions.totalNet > 0) {
      data.push({ name: 'Séances groupe', value: stats.sessions.totalNet });
    }
    return data;
  }, [stats]);

  const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

  const getPayoutStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      pending: { variant: "secondary", label: "En attente" },
      held: { variant: "outline", label: "En rétention" },
      ready: { variant: "default", label: "Prêt" },
      paid: { variant: "default", label: "Versé" },
      completed: { variant: "default", label: "Complété" },
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
      const dataToHash = `${coachId}-${timestamp}-${stats.combined.totalNet}`;
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
      doc.text("Domicares - Coaching Sportif", 60, 12);
      doc.text("Cotonou, Bénin", 60, 16);
      doc.text("contact@domicares.com", 60, 20);
      
      // QR Code
      doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - 35, 8, 25, 25);
      
      // Title
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text("Rapport de Revenus - Coach", 14, 42);
      doc.setFontSize(11);
      doc.text(coachName, 14, 48);
      
      // Date and verification code
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Généré le ${format(new Date(), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}`, 14, 54);
      doc.text(`Code: ${hashHex}`, 14, 59);
      
      // Separator line
      doc.setDrawColor(200);
      doc.line(14, 64, pageWidth - 14, 64);
      
      // Balance summary
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text("Résumé Financier", 14, 74);
      
      doc.setFontSize(10);
      doc.text(`Solde disponible: ${formatAmount(balance?.balance_available || 0)}`, 14, 82);
      doc.text(`En rétention: ${formatAmount(balance?.balance_on_hold || 0)}`, 14, 88);
      
      doc.text(`Revenus RDV: ${formatAmount(stats.appointments.totalNet)}`, 100, 82);
      doc.text(`Revenus séances: ${formatAmount(stats.sessions.totalNet)}`, 100, 88);
      doc.text(`Total net: ${formatAmount(stats.combined.totalNet)}`, 100, 94);
      
      let currentY = 105;

      // Group sessions table
      if (groupSessionPayments.length > 0) {
        doc.setFontSize(12);
        doc.text("Paiements Séances de Groupe", 14, currentY);
        
        autoTable(doc, {
          startY: currentY + 5,
          head: [["Date", "Séance", "Montant", "Commission", "Net"]],
          body: groupSessionPayments.slice(0, 30).map(payment => [
            format(new Date(payment.joined_at || payment.scheduled_date), "dd/MM/yyyy", { locale: fr }),
            payment.session_name,
            formatAmount(payment.price_per_person),
            `-${formatAmount(Math.round(payment.price_per_person * COACH_COMMISSION_RATE))}`,
            formatAmount(Math.round(payment.price_per_person * (1 - COACH_COMMISSION_RATE))),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] },
        });
        currentY = (doc as any).lastAutoTable?.finalY + 10 || currentY + 50;
      }

      // Appointment payments table
      if (appointmentPayments.length > 0 && currentY < 220) {
        doc.setFontSize(12);
        doc.text("Paiements Rendez-vous", 14, currentY);
        
        autoTable(doc, {
          startY: currentY + 5,
          head: [["Date", "Patient", "Montant", "Commission", "Net", "Statut"]],
          body: appointmentPayments.slice(0, 20).map(payment => [
            format(new Date(payment.created_at), "dd/MM/yyyy", { locale: fr }),
            payment.payer_name || "Patient",
            formatAmount(payment.amount),
            `-${formatAmount(payment.commission_amount || 0)}`,
            formatAmount(payment.net_amount || 0),
            PAYOUT_STATUS_LABELS[payment.payout_status as keyof typeof PAYOUT_STATUS_LABELS] || "En attente",
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [16, 185, 129] },
        });
      }
      
      // Footer
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Document généré automatiquement par Domicares", 14, pageHeight - 15);
      doc.text(`Vérification: ${hashHex}`, 14, pageHeight - 10);
      
      doc.save(`rapport-revenus-coach-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      
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

  const isLoading = balanceLoading || paymentsLoading || sessionsLoading || payoutsLoading;

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Période:</span>
          <div className="flex gap-1 flex-wrap">
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Solde disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {isLoading ? "..." : formatAmount(balance?.balance_available || 0)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              En rétention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {isLoading ? "..." : formatAmount(balance?.balance_on_hold || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Revenus séances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {isLoading ? "..." : formatAmount(stats.sessions.totalNet)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.sessions.count} paiement{stats.sessions.count > 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total net
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isLoading ? "..." : formatAmount(stats.combined.totalNet)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Commission: {formatAmount(stats.combined.totalCommissions)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {(revenueChartData.length > 0 || pieChartData.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {revenueChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Évolution des revenus</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: number) => formatAmount(value)}
                      labelStyle={{ fontWeight: 'bold' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="sessions" name="Séances" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="appointments" name="RDV" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {pieChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Répartition des revenus</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatAmount(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Payment History Tabs */}
      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions" className="gap-2">
            <Users className="h-4 w-4" />
            Séances de groupe ({groupSessionPayments.length})
          </TabsTrigger>
          <TabsTrigger value="appointments" className="gap-2">
            <FileText className="h-4 w-4" />
            Rendez-vous ({appointmentPayments.length})
          </TabsTrigger>
          <TabsTrigger value="payouts" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Reversements ({payouts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Paiements des séances de groupe</CardTitle>
              <CardDescription>
                Revenus des participants aux séances de coaching collectif
              </CardDescription>
            </CardHeader>
            <CardContent>
              {groupSessionPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun paiement de séance de groupe
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Séance</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupSessionPayments.map((payment) => {
                      const commission = Math.round(payment.price_per_person * COACH_COMMISSION_RATE);
                      const net = payment.price_per_person - commission;
                      return (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.joined_at || payment.scheduled_date), "dd/MM/yyyy", { locale: fr })}
                          </TableCell>
                          <TableCell className="font-medium">{payment.session_name}</TableCell>
                          <TableCell className="text-right">{formatAmount(payment.price_per_person)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">-{formatAmount(commission)}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">{formatAmount(net)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardHeader>
              <CardTitle>Paiements des rendez-vous individuels</CardTitle>
              <CardDescription>
                Revenus des consultations et séances individuelles
              </CardDescription>
            </CardHeader>
            <CardContent>
              {appointmentPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun paiement de rendez-vous individuel
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Statut versement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointmentPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {format(new Date(payment.created_at), "dd/MM/yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell className="font-medium">{payment.payer_name || "Patient"}</TableCell>
                        <TableCell className="text-right">{formatAmount(payment.amount)}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatAmount(payment.net_amount || 0)}
                        </TableCell>
                        <TableCell>{getPayoutStatusBadge(payment.payout_status || 'pending')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle>Historique des reversements</CardTitle>
              <CardDescription>
                Détails des versements effectués sur votre compte
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payouts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun reversement effectué
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell>
                          {format(new Date(payout.created_at!), "dd/MM/yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell>
                          {payout.period_start && payout.period_end 
                            ? `${format(new Date(payout.period_start), "dd/MM", { locale: fr })} - ${format(new Date(payout.period_end), "dd/MM/yyyy", { locale: fr })}`
                            : "N/A"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatAmount(payout.amount)}
                        </TableCell>
                        <TableCell>{payout.payment_method}</TableCell>
                        <TableCell>{getPayoutStatusBadge(payout.status || 'pending')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
