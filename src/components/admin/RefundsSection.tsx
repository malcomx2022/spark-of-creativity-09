import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RefreshCcw, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Canal du remboursement. FedaPay ne documente le remboursement que depuis son tableau de bord (MTN
 * uniquement) : le canal « manuel » enregistre ici, avec sa référence, un remboursement déjà effectué
 * là-bas ; le canal API tente l'appel et laisse le remboursement « en attente » tant que FedaPay ne
 * l'a pas confirmé.
 */
type RefundChannel = 'fedapay' | 'manual';

const REFUND_STATUS_LABELS: Record<string, string> = { pending: 'En attente de confirmation', completed: 'Effectué', failed: 'Échoué' };

/** Ligne de GET /admin/finance/payments (jointures patient et rendez-vous aplaties). */
interface RefundablePayment {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_practitioner_name: string | null;
  appointment_specialty: string | null;
}

/** Ligne de GET /admin/finance/refunds. */
interface PaymentRefund {
  id: string;
  payment_id: string;
  refund_amount: number;
  refund_reason: string | null;
  provider_refund_id: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  patient_name: string | null;
}

export function RefundsSection() {
  const [selectedPayment, setSelectedPayment] = useState<RefundablePayment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  // FedaPay ne propose le remboursement que depuis son tableau de bord (MTN) : canal manuel par défaut.
  const [channel, setChannel] = useState<RefundChannel>('manual');
  const [providerReference, setProviderReference] = useState("");
  const [confirmRef, setConfirmRef] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  // Fetch paid payments eligible for refund
  const { data: payments, isLoading } = useQuery({
    queryKey: ['refundable-payments'],
    queryFn: async () => {
      const [paid, partial] = await Promise.all([
        api.get<{ data: RefundablePayment[] }>('/admin/finance/payments', { query: { status: 'paid', limit: 50 } }),
        api.get<{ data: RefundablePayment[] }>('/admin/finance/payments', { query: { status: 'partially_refunded', limit: 50 } }),
      ]);
      return [...paid.data, ...partial.data]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
    }
  });

  // Fetch refund history
  const { data: refunds } = useQuery({
    queryKey: ['payment-refunds'],
    queryFn: async () => {
      const res = await api.get<{ data: PaymentRefund[] }>('/admin/finance/refunds', { query: { limit: 20 } });
      return res.data;
    }
  });

  // Process refund mutation
  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayment) throw new Error('No payment selected');

      // P1 #1: Frontend validation of refund amount
      const parsedAmount = refundAmount ? parseInt(refundAmount, 10) : null;

      if (parsedAmount !== null) {
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          throw new Error('Le montant du remboursement doit être un nombre positif');
        }
        if (parsedAmount > selectedPayment.amount) {
          throw new Error(`Le montant ne peut pas dépasser ${selectedPayment.amount.toLocaleString()} XOF`);
        }
      }

      if (channel === 'manual' && providerReference.trim().length < 3) {
        throw new Error('Indiquez la référence du remboursement effectué chez FedaPay');
      }

      // Remboursement FedaPay (ou enregistrement d'un remboursement manuel), écritures comptables
      // et journal d'audit sont gérés par l'API.
      return api.post<{ status: string }>('/admin/finance/refunds', {
        paymentId: selectedPayment.id,
        ...(parsedAmount !== null ? { refundAmount: parsedAmount } : {}),
        reason: refundReason,
        channel,
        ...(channel === 'manual' ? { providerReference: providerReference.trim() } : {}),
      }, { timeoutMs: 60_000 });
    },
    onSuccess: (data) => {
      if (data?.status === 'pending') {
        toast.info('Remboursement enregistré, en attente de confirmation par FedaPay. Confirmez-le ci-dessous une fois vérifié sur le tableau de bord FedaPay.');
      } else {
        toast.success('Remboursement traité avec succès');
      }
      setSelectedPayment(null);
      setRefundAmount("");
      setRefundReason("");
      setProviderReference("");
      setChannel('manual');
      queryClient.invalidateQueries({ queryKey: ['refundable-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-refunds'] });
    },
    onError: (error: unknown) => {
      toast.error('Erreur: ' + errorMessage(error, 'remboursement impossible'));
    }
  });

  // Confirmation d'un remboursement « en attente » après vérification chez FedaPay.
  const confirmMutation = useMutation({
    mutationFn: async (refund: PaymentRefund) => {
      const reference = (confirmRef[refund.id] ?? '').trim();
      return api.post(`/admin/finance/refunds/${refund.id}/confirm`, reference ? { providerReference: reference } : {}, { timeoutMs: 60_000 });
    },
    onSuccess: () => {
      toast.success('Remboursement confirmé et comptabilisé');
      queryClient.invalidateQueries({ queryKey: ['refundable-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-refunds'] });
    },
    onError: (error: unknown) => {
      toast.error('Erreur: ' + errorMessage(error, 'confirmation impossible'));
    }
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      'pending': 'secondary',
      'completed': 'outline',
      'failed': 'destructive'
    };
    return <Badge variant={variants[status] || 'default'}>{REFUND_STATUS_LABELS[status] ?? status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Refundable Payments */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Paiements Remboursables</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Praticien</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Chargement...</TableCell>
                </TableRow>
              ) : payments && payments.length > 0 ? (
                payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {new Date(payment.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{payment.patient_name || 'Patient inconnu'}</p>
                        {payment.patient_phone && (
                          <p className="text-xs text-muted-foreground">{payment.patient_phone}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{payment.appointment_practitioner_name || 'N/A'}</p>
                        {payment.appointment_specialty && (
                          <p className="text-xs text-muted-foreground">{payment.appointment_specialty}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {payment.amount.toLocaleString()} XOF
                    </TableCell>
                    <TableCell>
                      <Badge variant={payment.status === 'paid' ? 'outline' : 'secondary'}>
                        {payment.status === 'paid' ? 'Payé' : payment.status === 'partially_refunded' ? 'Remb. partiel' : payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedPayment(payment);
                              setRefundAmount(payment.amount.toString());
                            }}
                          >
                            <RefreshCcw className="h-4 w-4 mr-1" />
                            Rembourser
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Traiter un Remboursement</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                Montant Maximum: {payment.amount.toLocaleString()} XOF
                              </label>
                              <Input
                                type="number"
                                placeholder="Montant du remboursement"
                                value={refundAmount}
                                onChange={(e) => setRefundAmount(e.target.value)}
                                max={payment.amount}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Raison</label>
                              <Textarea
                                placeholder="Raison du remboursement..."
                                value={refundReason}
                                onChange={(e) => setRefundReason(e.target.value)}
                                rows={4}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Canal</label>
                              <Select value={channel} onValueChange={(v) => setChannel(v as RefundChannel)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Déjà effectué sur le tableau de bord FedaPay</SelectItem>
                                  <SelectItem value="fedapay">Par l'API FedaPay (non proposé par FedaPay à ce jour)</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                {channel === 'manual'
                                  ? "Le remboursement a été fait chez FedaPay (MTN uniquement) ou par virement : indiquez sa référence, Domicares enregistre les écritures et prévient le patient."
                                  : "FedaPay ne propose pas encore le remboursement par API : la demande sera refusée (502) et vous serez invité à utiliser le tableau de bord. Si FedaPay l'accepte un jour et qu'il reste « en attente », confirmez-le ci-dessous."}
                              </p>
                            </div>
                            {channel === 'manual' && (
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Référence FedaPay du remboursement</label>
                                <Input
                                  placeholder="Ex. : 123456 ou référence du virement"
                                  value={providerReference}
                                  onChange={(e) => setProviderReference(e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={() => refundMutation.mutate()}
                              disabled={!refundAmount || !refundReason || (channel === 'manual' && providerReference.trim().length < 3) || refundMutation.isPending}
                            >
                              {refundMutation.isPending ? 'Traitement...' : channel === 'manual' ? 'Enregistrer le Remboursement' : 'Confirmer le Remboursement'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Aucun paiement remboursable
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Refund History */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Historique des Remboursements</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Raison</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Traité Le</TableHead>
                <TableHead>Référence / Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds && refunds.length > 0 ? (
                refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>
                      {new Date(refund.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      {refund.patient_name || `Patient #${refund.payment_id.substring(0, 8)}`}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {refund.refund_amount.toLocaleString()} XOF
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{refund.refund_reason || '-'}</TableCell>
                    <TableCell>{getStatusBadge(refund.status)}</TableCell>
                    <TableCell>
                      {refund.processed_at
                        ? new Date(refund.processed_at).toLocaleDateString('fr-FR')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {refund.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-40"
                            placeholder="Référence FedaPay"
                            value={confirmRef[refund.id] ?? ''}
                            onChange={(e) => setConfirmRef((prev) => ({ ...prev, [refund.id]: e.target.value }))}
                          />
                          <Button size="sm" variant="outline" onClick={() => confirmMutation.mutate(refund)} disabled={confirmMutation.isPending}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Confirmer
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">{refund.provider_refund_id || '-'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Aucun remboursement trouvé
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
