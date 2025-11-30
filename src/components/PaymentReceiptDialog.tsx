import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import type { Payment } from '@/types/payment';
import { formatAmount, PAYMENT_STATUS_LABELS } from '@/lib/payment-config';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from '@/hooks/use-toast';

interface PaymentReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
}

export function PaymentReceiptDialog({ open, onOpenChange, payment }: PaymentReceiptDialogProps) {
  if (!payment) return null;

  const handleDownloadPDF = () => {
    try {
      // Créer un nouveau document PDF
      const doc = new jsPDF();

      // Configuration
      const pageWidth = doc.internal.pageSize.getWidth();
      const leftMargin = 20;
      const rightMargin = 20;
      let yPosition = 20;

      // En-tête
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('REÇU DE PAIEMENT', pageWidth / 2, yPosition, { align: 'center' });

      yPosition += 10;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('DomiCares - Soins de santé à domicile', pageWidth / 2, yPosition, { align: 'center' });

      // Ligne de séparation
      yPosition += 10;
      doc.setDrawColor(200, 200, 200);
      doc.line(leftMargin, yPosition, pageWidth - rightMargin, yPosition);

      // Informations de base
      yPosition += 15;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');

      const invoiceNumber = payment.invoice_number || `PAY-${payment.id.substring(0, 8).toUpperCase()}`;
      const dateStr = new Date(payment.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      // Tableau des informations principales
      const mainInfo = [
        ['Numéro de facture', invoiceNumber],
        ['Date de paiement', dateStr],
        ['Méthode de paiement', payment.payment_method.toUpperCase()],
        ['Statut', PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS] || payment.status],
      ];

      if (payment.fedapay_transaction_id) {
        mainInfo.push(['Transaction FedaPay', payment.fedapay_transaction_id]);
      }

      autoTable(doc, {
        startY: yPosition,
        head: [],
        body: mainInfo,
        theme: 'plain',
        styles: {
          fontSize: 10,
          cellPadding: 5,
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 'auto' },
        },
      });

      // Récupérer la position Y après le tableau
      yPosition = (doc as any).lastAutoTable.finalY + 15;

      // Détails du paiement
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Détails du paiement', leftMargin, yPosition);

      yPosition += 10;

      const paymentDetails: string[][] = [
        ['Montant total', formatAmount(payment.amount, payment.currency)],
      ];

      if (payment.commission_amount && payment.commission_amount > 0) {
        paymentDetails.push([
          'Commission plateforme',
          `-${formatAmount(payment.commission_amount, payment.currency)}`,
        ]);
      }

      if (payment.fees_amount && payment.fees_amount > 0) {
        paymentDetails.push([
          'Frais de transaction',
          `-${formatAmount(payment.fees_amount, payment.currency)}`,
        ]);
      }

      const netAmount = payment.amount - (payment.commission_amount || 0) - (payment.fees_amount || 0);
      if (payment.commission_amount || payment.fees_amount) {
        paymentDetails.push([
          'Montant net',
          formatAmount(netAmount, payment.currency),
        ]);
      }

      autoTable(doc, {
        startY: yPosition,
        head: [],
        body: paymentDetails,
        theme: 'striped',
        styles: {
          fontSize: 10,
          cellPadding: 5,
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 80 },
          1: { halign: 'right', cellWidth: 'auto' },
        },
      });

      // Pied de page
      const pageHeight = doc.internal.pageSize.getHeight();
      yPosition = pageHeight - 30;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(
        'Ce reçu a été généré automatiquement par la plateforme DomiCares.',
        pageWidth / 2,
        yPosition,
        { align: 'center' }
      );

      yPosition += 5;
      doc.text(
        `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
        pageWidth / 2,
        yPosition,
        { align: 'center' }
      );

      // Télécharger le PDF
      const fileName = `Recu_${invoiceNumber}_${dateStr.replace(/\s/g, '_')}.pdf`;
      doc.save(fileName);

      toast({
        title: 'Reçu téléchargé',
        description: 'Le reçu PDF a été téléchargé avec succès.',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de générer le reçu PDF. Veuillez réessayer.',
        variant: 'destructive',
      });
    }
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
