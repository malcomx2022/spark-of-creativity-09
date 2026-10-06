import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CreditCard, Download, Edit, ShieldCheck, ExternalLink, Clock, Trash2, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Filter, Search, ArrowUpDown, Wallet, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthUser } from '@/hooks/useAuthUser';
import type { Payment } from '@/types/payment';
import { useState, useMemo } from 'react';
import { PaymentReceiptDialog } from '@/components/PaymentReceiptDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
  PAYOUT_STATUS_LABELS,
  type PaymentStatus,
  formatAmount,
  isPaymentFinal,
} from '@/lib/payment-config';
import { useSavedPaymentMethods } from '@/hooks/useSavedPaymentMethods';
import { normalizePhoneNumber } from '@/lib/phone-utils';

// Helper pour échapper les valeurs CSV
const escapeCSV = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Si la valeur contient des virgules, guillemets ou sauts de ligne, on l'encadre de guillemets
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    // Doubler les guillemets pour l'échappement
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function PaymentsSection() {
  const { data: user } = useAuthUser();
  const queryClient = useQueryClient();

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  // Filtres et recherche
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Dialog states
  const [isPaymentMethodDialogOpen, setIsPaymentMethodDialogOpen] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);

  // Confirmation suppression
  const [deleteMethodId, setDeleteMethodId] = useState<string | null>(null);
  const [copiedTransactionId, setCopiedTransactionId] = useState<string | null>(null);

  const {
    paymentMethods,
    isLoading: isLoadingPaymentMethods,
    addPaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
  } = useSavedPaymentMethods();

  const { data: paymentsResult, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['payments', user?.id, currentPage, pageSize, statusFilter, sortOrder],
    queryFn: async () => {
      if (!user?.id) return { data: [], count: 0 };

      // GET /payments : paiements de l'utilisateur (filtre, tri et pagination côté client)
      const rows = await api.get<Payment[]>('/payments', { query: { limit: 200 } });
      const statusSets: Record<string, string[]> = {
        success: ['paid', 'authorized'],
        pending: ['initiated', 'pending'],
        failed: ['failed', 'canceled', 'declined'],
      };
      const filtered = rows
        .filter((p) => p.patient_id === user.id)
        .filter((p) => statusFilter === 'all' || (statusSets[statusFilter] ?? []).includes(p.status))
        .sort((a, b) => (sortOrder === 'asc' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
      return { data: filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize), count: filtered.length };
    },
    enabled: !!user?.id,
  });

  const payments = paymentsResult?.data || [];
  const totalCount = paymentsResult?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Filtrer par recherche (côté client pour l'ID de transaction)
  const filteredPayments = useMemo(() => {
    if (!searchQuery.trim()) return payments;
    const query = searchQuery.toLowerCase();
    return payments.filter(p =>
      p.fedapay_transaction_id?.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query)
    );
  }, [payments, searchQuery]);

  // Statistiques
  const stats = useMemo(() => {
    // Récupérer tous les paiements pour les stats (sans pagination)
    const allPayments = payments;
    const paid = allPayments.filter(p => p.status === 'paid' || p.status === 'authorized');
    const pending = allPayments.filter(p => p.status === 'initiated' || p.status === 'pending');
    const failed = allPayments.filter(p => p.status === 'failed' || p.status === 'canceled' || p.status === 'declined');

    return {
      totalPaid: paid.reduce((sum, p) => sum + (p.amount || 0), 0),
      totalPending: pending.reduce((sum, p) => sum + (p.amount || 0), 0),
      countPaid: paid.length,
      countPending: pending.length,
      countFailed: failed.length,
    };
  }, [payments]);

  // Copy transaction ID
  const handleCopyTransactionId = async (transactionId: string) => {
    try {
      await navigator.clipboard.writeText(transactionId);
      setCopiedTransactionId(transactionId);
      toast({ title: 'ID copié', description: 'L\'ID de transaction a été copié.' });
      setTimeout(() => setCopiedTransactionId(null), 2000);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier l\'ID.', variant: 'destructive' });
    }
  };

  // Confirm delete payment method
  const handleConfirmDeleteMethod = () => {
    if (deleteMethodId) {
      deletePaymentMethod(deleteMethodId);
      setDeleteMethodId(null);
    }
  };

  const resolveStatusVariant = (status: string) => {
    if (status in PAYMENT_STATUS_VARIANTS) {
      return PAYMENT_STATUS_VARIANTS[status as keyof typeof PAYMENT_STATUS_VARIANTS];
    }

    return 'outline';
  };

  const resolveStatusLabel = (status: string) => {
    if (status in PAYMENT_STATUS_LABELS) {
      return PAYMENT_STATUS_LABELS[status as keyof typeof PAYMENT_STATUS_LABELS];
    }

    return status;
  };

  const resolvePayoutLabel = (status?: string | null) => {
    if (!status) return null;

    if (status in PAYOUT_STATUS_LABELS) {
      return PAYOUT_STATUS_LABELS[status as keyof typeof PAYOUT_STATUS_LABELS];
    }

    return status;
  };

  const handleOpenFedaPay = (url: string) => {
    if (typeof window === 'undefined') return;

    const features = 'width=600,height=700,scrollbars=yes,location=yes';
    window.open(url, '_blank', features);
  };

  const handleSavePaymentMethod = async () => {
    const normalized = normalizePhoneNumber(phoneNumber);

    if (!normalized) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer un numéro au format international (ex. +22912345678)',
        variant: 'destructive',
      });
      return;
    }

    try {
      await addPaymentMethod({
        provider: paymentProvider as 'mtn' | 'moov',
        phoneNumber: normalized,
        setAsDefault: (paymentMethods?.length ?? 0) === 0,
      });
      setIsPaymentMethodDialogOpen(false);
      setPhoneNumber('');
      setPaymentProvider('mtn');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Payment method save error:', error);
      }
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Impossible d’enregistrer ce numéro pour le moment.',
        variant: 'destructive',
      });
    }
  };

  const handleExportPayments = async () => {
    try {
      if (payments.length === 0) {
        toast({
          title: 'Aucune donnée',
          description: 'Aucun paiement à exporter',
          variant: 'destructive',
        });
        return;
      }

      // Récupérer les paiements (au plus 200, limite de l'API)
      const allPayments = (await api.get<Payment[]>('/payments', { query: { limit: 200 } })).filter((p) => p.patient_id === user?.id);

      if (!allPayments || allPayments.length === 0) {
        toast({
          title: 'Aucune donnée',
          description: 'Aucun paiement à exporter',
          variant: 'destructive',
        });
        return;
      }

      // Avertissement si limite atteinte
      if (allPayments.length === 200) {
        toast({
          title: 'Export limité',
          description: 'Export limité aux 200 paiements les plus récents',
        });
      }

      // Créer un CSV avec échappement correct
      const headers = ['Date', 'Montant', 'Devise', 'Mode de paiement', 'Statut', 'Transaction ID'];
      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...allPayments.map(payment => [
          escapeCSV(new Date(payment.created_at).toLocaleDateString('fr-FR')),
          escapeCSV(payment.amount ?? ''),
          escapeCSV(payment.currency ?? ''),
          escapeCSV(payment.payment_method?.toUpperCase() ?? ''),
          escapeCSV(resolveStatusLabel(payment.status ?? '')),
          escapeCSV(payment.fedapay_transaction_id ?? ''),
        ].join(',')),
      ].join('\n');

      // Télécharger le fichier
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `paiements_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export réussi',
        description: `${allPayments.length} paiement(s) exporté(s)`,
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('CSV export error:', error);
      }
      toast({
        title: 'Erreur d\'export',
        description: error instanceof Error ? error.message : 'Impossible d\'exporter les paiements',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Paiements gérés par FedaPay</AlertTitle>
        <AlertDescription>
          Consultez vos transactions mobile money. Si un paiement est encore en attente, vous pouvez reprendre le processus directement sur la plateforme sécurisée FedaPay.
        </AlertDescription>
      </Alert>

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total payé</p>
              <p className="text-lg font-bold text-green-600">{formatAmount(stats.totalPaid)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-lg font-bold text-orange-600">{formatAmount(stats.totalPending)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Réussis</p>
              <p className="text-lg font-bold">{stats.countPaid}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Échoués</p>
              <p className="text-lg font-bold text-red-600">{stats.countFailed}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Historique des paiements
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Rafraîchir"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Recherche */}
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full sm:w-[150px] h-9"
                />
              </div>

              {/* Filtre par statut */}
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(0); }}>
                <SelectTrigger className="w-[130px] h-9">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="success">Réussis</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="failed">Échoués</SelectItem>
                </SelectContent>
              </Select>

              {/* Tri */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className="h-9"
              >
                <ArrowUpDown className="h-4 w-4 mr-1" />
                {sortOrder === 'desc' ? 'Récent' : 'Ancien'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-2 p-4 border rounded-lg">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'Aucun paiement trouvé pour cette recherche' : 'Aucun paiement enregistré'}
              </p>
              {searchQuery && (
                <Button variant="link" onClick={() => setSearchQuery('')} className="mt-2">
                  Effacer la recherche
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {formatAmount(payment.amount, payment.currency)}
                      </p>
                      <Badge variant={resolveStatusVariant(payment.status)}>
                        {resolveStatusLabel(payment.status)}
                      </Badge>
                      {isPaymentFinal(payment.status as PaymentStatus) && payment.payout_status && (
                        <Badge variant="outline">
                          Versement : {resolvePayoutLabel(payment.payout_status)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Mode : {payment.payment_method.toUpperCase()}
                    </p>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground cursor-help">
                            {new Date(payment.created_at).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })} à {new Date(payment.created_at).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{new Date(payment.created_at).toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {payment.fedapay_transaction_id && (
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs font-mono text-muted-foreground cursor-help truncate max-w-[200px]">
                                ID: {payment.fedapay_transaction_id}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-mono">{payment.fedapay_transaction_id}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleCopyTransactionId(payment.fedapay_transaction_id!)}
                        >
                          {copiedTransactionId === payment.fedapay_transaction_id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    )}
                    {payment.hold_until && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> Versement estimé le {new Date(payment.hold_until).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    {['initiated', 'pending', 'authorized'].includes(payment.status) && payment.fedapay_payment_url && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenFedaPay(payment.fedapay_payment_url!)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Continuer sur FedaPay
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPayment(payment);
                        setIsReceiptDialogOpen(true);
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Reçu
                    </Button>
                  </div>
                </div>
               ))}
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t pt-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {currentPage + 1} sur {totalPages} ({totalCount} paiements)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0 || isFetching}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage >= totalPages - 1 || isFetching}
                    >
                      Suivant
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <Button variant="outline" onClick={handleExportPayments} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Exporter tous les paiements (CSV)
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moyens de paiement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Modes de paiement acceptés via FedaPay : MTN Mobile Money, Moov Money
          </p>
          {isLoadingPaymentMethods ? (
            <p className="text-muted-foreground text-sm mb-4">Chargement des méthodes enregistrées...</p>
          ) : paymentMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-4">
              Aucun numéro enregistré pour le moment. Ajoutez votre ligne mobile money pour accélérer les paiements.
            </p>
          ) : (
            <div className="space-y-3 mb-4">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border rounded-lg p-3"
                >
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {method.provider.toUpperCase()}
                      {method.is_default && (
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Par défaut
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{method.phone_number_masked}</p>
                    <p className="text-xs text-muted-foreground">
                      Consentement donné le {new Date(method.consent_given_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!method.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultPaymentMethod(method.id)}
                      >
                        Définir par défaut
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/40"
                      onClick={() => setDeleteMethodId(method.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" onClick={() => setIsPaymentMethodDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Ajouter un moyen de paiement
          </Button>
        </CardContent>
       </Card>

       <Dialog open={isPaymentMethodDialogOpen} onOpenChange={setIsPaymentMethodDialogOpen}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Ajouter un moyen de paiement</DialogTitle>
            <DialogDescription>
              Enregistrez votre numéro de téléphone pour les paiements mobile money sécurisés par FedaPay
            </DialogDescription>
           </DialogHeader>
           <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label htmlFor="provider">Opérateur</Label>
               <Select value={paymentProvider} onValueChange={setPaymentProvider}>
                 <SelectTrigger id="provider">
                   <SelectValue placeholder="Sélectionnez un opérateur" />
                 </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                    <SelectItem value="moov">Moov Money</SelectItem>
                  </SelectContent>
               </Select>
             </div>
             <div className="space-y-2">
               <Label htmlFor="phone">Numéro de téléphone</Label>
               <Input
                 id="phone"
                 type="tel"
                 placeholder="Ex: 0123456789"
                 value={phoneNumber}
                 onChange={(e) => setPhoneNumber(e.target.value)}
               />
             </div>
           </div>
           <DialogFooter>
             <Button variant="outline" onClick={() => setIsPaymentMethodDialogOpen(false)}>
               Annuler
             </Button>
             <Button onClick={handleSavePaymentMethod}>
               Enregistrer
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentReceiptDialog
        open={isReceiptDialogOpen}
        onOpenChange={setIsReceiptDialogOpen}
        payment={selectedPayment}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deleteMethodId} onOpenChange={(open) => !open && setDeleteMethodId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer ce moyen de paiement ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteMethod}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
