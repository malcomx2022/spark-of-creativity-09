import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Download, TrendingUp, TrendingDown, Wallet, Clock, FileText, Calendar, RefreshCw, HelpCircle, Copy, Check, CreditCard, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, onTableChange } from "@/lib/api";
import { format, subMonths, startOfMonth, endOfMonth, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import type { jsPDF } from "jspdf";
import { loadPdf } from "@/lib/pdf";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { formatAmount, PAYOUT_STATUS_LABELS } from "@/lib/payment-config";
import logoImage from "@/assets/logo.png";
import QRCode from "qrcode";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

type PractitionerPayout = {
  id: string;
  practitioner_id: string;
  amount: number;
  currency: string | null;
  status: string | null;
  payment_method?: string | null;
  description?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  fedapay_transfer_id?: string | null;
  failure_reason?: string | null;
  sent_at?: string | null;
  completed_at?: string | null;
  processed_at?: string | null;
  created_at: string;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['practitioner-balance', practitionerId] }),
      queryClient.invalidateQueries({ queryKey: ['practitioner-payments', practitionerId] }),
      queryClient.invalidateQueries({ queryKey: ['practitioner-payouts', practitionerId] }),
    ]);
    setIsRefreshing(false);
  };

  // Handle copy
  const handleCopy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Format date for tooltip
  const formatFullDate = (date: string) => {
    try {
      return format(new Date(date), "EEEE dd MMMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return date;
    }
  };

  // Format relative date
  const formatRelativeDate = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
    } catch {
      return date;
    }
  };

  // Fetch practitioner balance with maybeSingle to handle missing data
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["practitioner-balance", practitionerId],
    queryFn: async () => {
      // Solde recalculé par l'API à chaque lecture (GET /finance/me/balance)
      return api.get<PractitionerBalance>('/finance/me/balance');
    },
  });

  // Realtime updates pour la balance praticien
  useEffect(() => {
    if (!practitionerId) return;

    // Temps réel : solde, reversements et paiements du praticien (rooms practitioner:<id>)
    const off = onTableChange(['practitioner_balances', 'practitioner_payouts', 'payments'], (event) => {
      queryClient.invalidateQueries({ queryKey: ['practitioner-balance', practitionerId] });
      queryClient.invalidateQueries({ queryKey: ['practitioner-payments', practitionerId] });
      queryClient.invalidateQueries({ queryKey: ['practitioner-payouts', practitionerId] });

      if (event.table === 'practitioner_balances' && event.op === 'UPDATE') {
        api.get<PractitionerBalance>('/finance/me/balance')
          .then((newBalance) => setBalanceUpdate(`Nouveau solde: ${formatAmount(newBalance.balance_available)} XOF`))
          .catch(() => undefined);
      }
    });

    return off;
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
      // GET /payments renvoie les paiements des rendez-vous du praticien (et des séances de groupe du coach)
      const rows = await api.get<(PaymentWithAppointment & { appointment_practitioner_id?: string | null })[]>('/payments', {
        query: { status: 'paid', limit: Math.min(paymentsLimit * 2, 200) },
      });
      return rows
        .filter((p) => p.appointment_practitioner_id === practitionerId)
        .filter((p) => !dateFilter || p.created_at >= dateFilter)
        .slice(0, paymentsLimit);
    },
  });

  // Fetch payouts history
  const { data: payouts, isLoading: payoutsLoading } = useQuery({
    queryKey: ["practitioner-payouts", practitionerId, payoutsLimit, dateFilter],
    queryFn: async () => {
      const rows = await api.get<PractitionerPayout[]>('/finance/me/payouts', { query: { page: 0, limit: Math.min(payoutsLimit, 100) } });
      return rows.filter((p) => !dateFilter || (p.created_at ?? '') >= dateFilter);
    },
  });

  // Calculate total statistics with trends
  const stats = useMemo(() => {
    if (!payments) return {
      totalRevenue: 0, totalCommissions: 0, totalFees: 0, totalNet: 0, paidCount: 0,
      trend: { revenue: 0, net: 0 }
    };

    const now = new Date();
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const thisMonthStart = startOfMonth(now);

    let thisMonthNet = 0;
    let lastMonthNet = 0;

    const result = payments.reduce((acc, payment) => {
      const paymentDate = new Date(payment.created_at);
      const netAmount = payment.net_amount || 0;

      // Calculate monthly comparison
      if (paymentDate >= thisMonthStart) {
        thisMonthNet += netAmount;
      } else if (paymentDate >= lastMonthStart && paymentDate < thisMonthStart) {
        lastMonthNet += netAmount;
      }

      return {
        totalRevenue: acc.totalRevenue + (payment.amount || 0),
        totalCommissions: acc.totalCommissions + (payment.commission_amount || 0),
        totalFees: acc.totalFees + (payment.fees_amount || 0) + (payment.gateway_fees_amount || 0),
        totalNet: acc.totalNet + netAmount,
        paidCount: acc.paidCount + 1,
      };
    }, { totalRevenue: 0, totalCommissions: 0, totalFees: 0, totalNet: 0, paidCount: 0 });

    // Calculate trend percentage
    const trendNet = lastMonthNet > 0
      ? Math.round(((thisMonthNet - lastMonthNet) / lastMonthNet) * 100)
      : thisMonthNet > 0 ? 100 : 0;

    return { ...result, trend: { revenue: trendNet, net: trendNet } };
  }, [payments]);

  // Check if any data is loading
  const isLoading = balanceLoading || paymentsLoading || payoutsLoading;

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
      planned: { variant: "secondary", label: "Planifié" },
      processing: { variant: "outline", label: "En cours" },
      sent: { variant: "outline", label: "En cours de versement" },
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
      const { jsPDF, autoTable } = await loadPdf();
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
      const currentY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 105;
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

  // Skeleton loading
  if (isLoading && !balance && !payments) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        {/* Balance cards skeleton */}
        <div className="grid gap-4 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Charts skeleton */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Global Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6" />
              Revenus et Reversements
              <Badge variant="secondary" className="ml-2">
                {stats.paidCount} paiement(s)
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Suivez vos revenus, commissions et reversements. Les montants sont actualisés en temps réel.</p>
                </TooltipContent>
              </Tooltip>
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Gérez vos paiements et consultez l'historique de vos reversements
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            <Button onClick={exportToPDF} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Exporter PDF
            </Button>
          </div>
        </div>

        {/* Period Filter */}
        <div className="flex items-center gap-2 flex-wrap">
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

        {/* Balance Overview */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Solde disponible
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Montant prêt à être reversé sur votre compte</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {balanceLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-primary">
                    {formatAmount(balance?.balance_available || 0)}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(formatAmount(balance?.balance_available || 0), 'available')}
                      >
                        {copiedField === 'available' ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copier le montant</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                En attente
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Paiements en cours de traitement (7 jours)</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {balanceLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatAmount(balance?.balance_pending || 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                En rétention
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Montants temporairement bloqués (vérification, litige)</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {balanceLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatAmount(balance?.balance_on_hold || 0)}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total revenus nets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatAmount(stats.totalNet)}
                    </span>
                    {stats.trend.net !== 0 && (
                      <Badge
                        variant="outline"
                        className={stats.trend.net > 0
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-red-100 text-red-700 border-red-300'
                        }
                      >
                        {stats.trend.net > 0 ? (
                          <ArrowUpRight className="h-3 w-3 mr-1" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 mr-1" />
                        )}
                        {Math.abs(stats.trend.net)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.paidCount} paiement(s) • vs mois précédent
                  </p>
                </>
              )}
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
              {balanceLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : balance?.last_payout_at ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-lg font-medium cursor-help">
                      {formatRelativeDate(balance.last_payout_at)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{formatFullDate(balance.last_payout_at)}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="text-lg font-medium text-muted-foreground">Aucun</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Évolution des Revenus
              </CardTitle>
              <CardDescription>Montants nets par mois (ordre chronologique)</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : revenueChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <RechartsTooltip formatter={(value) => formatAmount(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="montant" stroke="hsl(var(--primary))" name="Montant Net" strokeWidth={2} />
                    <Line type="monotone" dataKey="commission" stroke="hsl(var(--destructive))" name="Commission" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-sm">Aucune donnée de revenus disponible</p>
                  <p className="text-xs mt-1">Les données apparaîtront après vos premières consultations</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Répartition par Statut
              </CardTitle>
              <CardDescription>Distribution des paiements</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : pieChartData.length > 0 ? (
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
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                  <DollarSign className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-sm">Aucune donnée de répartition</p>
                  <p className="text-xs mt-1">Les statistiques apparaîtront avec vos premiers paiements</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Payments and Payouts */}
        <Tabs defaultValue="payments" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Paiements
              <Badge variant="secondary" className="ml-1">{payments?.length || 0}</Badge>
            </TabsTrigger>
            <TabsTrigger value="payouts" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Reversements
              <Badge variant="secondary" className="ml-1">{payouts?.length || 0}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Historique des Paiements
                </CardTitle>
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
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        </TableRow>
                      ))
                    ) : payments && payments.length > 0 ? (
                      payments.map((payment) => (
                        <TableRow key={payment.id} className="hover:bg-muted/50">
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {format(new Date(payment.created_at), "dd/MM/yyyy", { locale: fr })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{formatFullDate(payment.created_at)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{payment.payer_name || "Patient"}</TableCell>
                          <TableCell>{formatAmount(payment.amount)}</TableCell>
                          <TableCell className="text-destructive">-{formatAmount(payment.commission_amount || 0)}</TableCell>
                          <TableCell className="text-destructive">-{formatAmount((payment.fees_amount || 0) + (payment.gateway_fees_amount || 0))}</TableCell>
                          <TableCell className="font-bold text-green-600">{formatAmount(payment.net_amount || 0)}</TableCell>
                          <TableCell>{getPaymentStatusBadge(payment.payout_status || "pending")}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <DollarSign className="h-12 w-12 mb-4 opacity-30" />
                            <p className="text-sm font-medium">Aucun paiement trouvé</p>
                            <p className="text-xs mt-1">Les paiements apparaîtront ici après vos consultations</p>
                          </div>
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
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Historique des Reversements
                </CardTitle>
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
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        </TableRow>
                      ))
                    ) : payouts && payouts.length > 0 ? (
                      payouts.map((payout) => (
                        <TableRow key={payout.id} className="hover:bg-muted/50">
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {format(new Date(payout.created_at!), "dd/MM/yyyy", { locale: fr })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{formatFullDate(payout.created_at!)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {payout.period_start && payout.period_end
                              ? `${format(new Date(payout.period_start), "dd/MM", { locale: fr })} - ${format(new Date(payout.period_end), "dd/MM/yyyy", { locale: fr })}`
                              : "N/A"}
                          </TableCell>
                          <TableCell className="font-bold text-green-600">{formatAmount(payout.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{payout.payment_method || "N/A"}</Badge>
                          </TableCell>
                          <TableCell>{getPayoutStatusBadge(payout.status || "pending")}</TableCell>
                          <TableCell>
                            {payout.processed_at ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    {format(new Date(payout.processed_at), "dd/MM/yyyy", { locale: fr })}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{formatFullDate(payout.processed_at)}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <Wallet className="h-12 w-12 mb-4 opacity-30" />
                            <p className="text-sm font-medium">Aucun reversement trouvé</p>
                            <p className="text-xs mt-1">Les reversements apparaîtront ici une fois votre solde disponible</p>
                          </div>
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
    </TooltipProvider>
  );
}
