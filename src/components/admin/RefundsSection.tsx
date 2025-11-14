import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
        .select('*')
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
        .select('*')
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
      
      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: {
          paymentId: selectedPayment.id,
          refundAmount: refundAmount ? parseInt(refundAmount) : null,
          reason: refundReason
        }
      });

      if (error) throw error;
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
                <TableHead>Montant</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>RDV</TableHead>
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
                    <TableCell className="text-right font-semibold">
                      {payment.amount.toLocaleString()} XOF
                    </TableCell>
                    <TableCell>Patient ID: {payment.patient_id.substring(0, 8)}</TableCell>
                    <TableCell>RDV: {payment.appointment_id.substring(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant={payment.status === 'paid' ? 'outline' : 'secondary'}>
                        {payment.status}
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
                refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>
                      {new Date(refund.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>Patient #{refund.payment_id.substring(0, 8)}</TableCell>
                    <TableCell className="text-right font-semibold">
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
