import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CreditCard, Download, Edit, ShieldCheck, ExternalLink, Clock, Trash2, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import type { Payment } from '@/types/payment';
import { useState } from 'react';
import { PaymentReceiptDialog } from '@/components/PaymentReceiptDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
const escapeCSV = (value: any): string => {
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
  const { data: user } = useSupabaseUser();
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [isPaymentMethodDialogOpen, setIsPaymentMethodDialogOpen] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);
  const {
    paymentMethods,
    isLoading: isLoadingPaymentMethods,
    addPaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
  } = useSavedPaymentMethods();

  const { data: paymentsResult, isLoading } = useQuery({
    queryKey: ['payments', user?.id, page],
    queryFn: async () => {
      if (!user?.id) return { data: [], count: 0 };
      
      const { data, error, count } = await supabase
        .from('payments')
        .select('*', { count: 'exact' })
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!user?.id,
  });

  const payments = paymentsResult?.data || [];
  const totalCount = paymentsResult?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

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

      // Récupérer tous les paiements (max 1000)
      const { data: allPayments, error } = await supabase
        .from('payments')
        .select('*')
        .eq('patient_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      if (!allPayments || allPayments.length === 0) {
        toast({
          title: 'Aucune donnée',
          description: 'Aucun paiement à exporter',
          variant: 'destructive',
        });
        return;
      }

      // Avertissement si limite atteinte
      if (allPayments.length === 1000) {
        toast({
          title: 'Export limité',
          description: 'Export limité aux 1000 paiements les plus récents',
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Historique des paiements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Chargement...</p>
          ) : payments.length === 0 ? (
            <p className="text-muted-foreground">Aucun paiement enregistré</p>
          ) : (
            <div className="space-y-4">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-4 p-4 border rounded-lg"
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
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {payment.fedapay_transaction_id && (
                      <p className="text-xs font-mono text-muted-foreground">
                        Transaction FedaPay : {payment.fedapay_transaction_id}
                      </p>
                    )}
                    {payment.hold_until && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> Versement estimé le {new Date(payment.hold_until).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
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
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Précédent
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1} sur {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
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
                      onClick={() => deletePaymentMethod(method.id)}
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
    </div>
  );
}
