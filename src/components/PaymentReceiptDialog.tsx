import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import type { Payment } from '@/types/payment';
import { formatAmount, PAYMENT_STATUS_LABELS } from '@/lib/payment-config';

interface PaymentReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
}

export function PaymentReceiptDialog({ open, onOpenChange, payment }: PaymentReceiptDialogProps) {
  if (!payment) return null;

  const handleDownloadPDF = () => {
    // TODO: Générer et télécharger le PDF du reçu
    const receiptData = {
      invoiceNumber: payment.invoice_number,
      date: new Date(payment.created_at).toLocaleDateString('fr-FR'),
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.payment_method.toUpperCase(),
      status: payment.status,
    };

    console.log('Downloading receipt:', receiptData);
    // Implémenter la génération PDF ici
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Reçu de paiement</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* En-tête du reçu */}
          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold">Votre santé, notre priorité</h3>
            <p className="text-sm text-muted-foreground">Plateforme de santé à domicile</p>
          </div>

          {/* Informations de facturation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Numéro de facture</p>
              <p className="font-semibold">
                {payment.invoice_number || 'En attente'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-semibold">
                {new Date(payment.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Méthode de paiement</p>
              <p className="font-semibold">{payment.payment_method.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <p className="font-semibold">
                {PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS] || payment.status}
              </p>
            </div>
          </div>

          {/* Détails du paiement */}
          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3">Détails du paiement</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant</span>
                <span>{formatAmount(payment.amount, payment.currency)}</span>
              </div>
              
              {payment.commission_amount && payment.commission_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Commission plateforme</span>
                  <span>-{formatAmount(payment.commission_amount, payment.currency)}</span>
                </div>
              )}
              
              {payment.fees_amount && payment.fees_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frais</span>
                  <span>-{formatAmount(payment.fees_amount, payment.currency)}</span>
                </div>
              )}
              
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{formatAmount(payment.amount, payment.currency)}</span>
              </div>
            </div>
          </div>

          {/* Transaction ID */}
          {payment.fedapay_transaction_id && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">ID de transaction</p>
              <p className="text-sm font-mono">{payment.fedapay_transaction_id}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleDownloadPDF} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Télécharger le reçu (PDF)
            </Button>
          </div>

          {/* Note légale */}
          <p className="text-xs text-muted-foreground text-center">
            Ce reçu constitue une preuve de paiement. Conservez-le pour vos archives.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
