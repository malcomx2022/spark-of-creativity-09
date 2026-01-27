import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RefreshCcw } from "lucide-react";

export function RefundsSection() {
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const queryClient = useQueryClient();

  // Fetch paid payments eligible for refund
  const { data: payments, isLoading } = useQuery({
    queryKey: ['refundable-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          patient:profiles!payments_patient_id_fkey(id, full_name, phone),
          appointment:appointments!payments_appointment_id_fkey(id, practitioner_name, specialty, date)
        `)
        .in('status', ['paid', 'partially_refunded'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    }
  });

  // Fetch refund history
  const { data: refunds } = useQuery({
    queryKey: ['payment-refunds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_refunds')
        .select(`
          *,
          payment:payments!payment_refunds_payment_id_fkey(
            id, amount, patient_id,
            patient:profiles!payments_patient_id_fkey(full_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
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

      const { data, error } = await invokeEdgeFunctionWithRetry('process-refund', {
        body: {
          paymentId: selectedPayment.id,
          refundAmount: parsedAmount,
          reason: refundReason
        }
      });

      if (error) throw error;

      // Add audit log
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'Refund processed',
          entity_type: 'payment',
          entity_id: selectedPayment.id,
          details: {
            amount: parsedAmount || selectedPayment.amount,
            reason: refundReason,
            patient_id: selectedPayment.patient_id,
          },
        });
      }

      return data;
    },
    onSuccess: () => {
      toast.success('Remboursement traité avec succès');
      setSelectedPayment(null);
      setRefundAmount("");
      setRefundReason("");
      queryClient.invalidateQueries({ queryKey: ['refundable-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-refunds'] });
    },
    onError: (error: Error) => {
      toast.error('Erreur: ' + error.message);
    }
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      'pending': 'secondary',
      'completed': 'outline',
      'failed': 'destructive'
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
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
                payments.map((payment: any) => (
                  <TableRow key={payment.id}>
                    <TableCell>
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
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={() => refundMutation.mutate()}
                              disabled={!refundAmount || !refundReason || refundMutation.isPending}
                            >
                              {refundMutation.isPending ? 'Traitement...' : 'Confirmer le Remboursement'}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds && refunds.length > 0 ? (
                refunds.map((refund: any) => (
                  <TableRow key={refund.id}>
                    <TableCell>
                      {new Date(refund.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      {refund.payment?.patient?.full_name || `Patient #${refund.payment_id.substring(0, 8)}`}
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
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
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
