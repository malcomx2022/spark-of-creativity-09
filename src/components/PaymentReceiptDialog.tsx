import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import type { Payment } from '@/types/payment';
import { formatAmount, PAYMENT_STATUS_LABELS } from '@/lib/payment-config';
import type { jsPDF } from 'jspdf';
import { loadPdf } from '@/lib/pdf';
import { toast } from '@/hooks/use-toast';

interface PaymentReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
}

export function PaymentReceiptDialog({ open, onOpenChange, payment }: PaymentReceiptDialogProps) {
  if (!payment) return null;

  const handleDownloadPDF = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF();
      
      // Générer le numéro de facture si non disponible
      const invoiceNumber = payment.invoice_number || `PAY-${payment.id.substring(0, 8).toUpperCase()}`;
      const dateStr = new Date(payment.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');
      
      // En-tête
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('REÇU DE PAIEMENT', 105, 20, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('DomiCares - Soins de santé à domicile', 105, 28, { align: 'center' });
      
      // Ligne de séparation
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 35, 190, 35);
      
      // Tableau des informations principales
      autoTable(doc, {
        startY: 45,
        head: [['Information', 'Détail']],
        body: [
          ['Numéro de facture', invoiceNumber],
          ['Date de paiement', new Date(payment.created_at).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })],
          ['Méthode de paiement', payment.payment_method.toUpperCase()],
          ['Statut', PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS] || payment.status],
          ...(payment.fedapay_transaction_id ? [['Transaction FedaPay ID', payment.fedapay_transaction_id]] : [])
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 10,
          cellPadding: 5
        }
      });
      
      // Calculer le montant net
      const commissionAmount = payment.commission_amount || 0;
      const feesAmount = payment.fees_amount || 0;
      const netAmount = payment.amount - commissionAmount - feesAmount;
      
      // Tableau des détails financiers
      const financialData = [
        ['Montant total', formatAmount(payment.amount, payment.currency)]
      ];
      
      if (commissionAmount > 0) {
        financialData.push(['Commission plateforme', `-${formatAmount(commissionAmount, payment.currency)}`]);
      }
      
      if (feesAmount > 0) {
        financialData.push(['Frais de transaction', `-${formatAmount(feesAmount, payment.currency)}`]);
      }
      
      financialData.push(['Montant net', formatAmount(netAmount, payment.currency)]);
      
      autoTable(doc, {
        startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable.finalY + 10,
        head: [['Description', 'Montant']],
        body: financialData,
        theme: 'grid',
        headStyles: {
          fillColor: [52, 152, 219],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 10,
          cellPadding: 5
        },
        footStyles: {
          fillColor: [241, 241, 241],
          textColor: 0,
          fontStyle: 'bold'
        }
      });
      
      // Pied de page
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
        105,
        pageHeight - 15,
        { align: 'center' }
      );
      doc.text(
        'Ce reçu constitue une preuve de paiement. Conservez-le pour vos archives.',
        105,
        pageHeight - 10,
        { align: 'center' }
      );
      
      // Télécharger le PDF
      doc.save(`Recu_${invoiceNumber}_${dateStr}.pdf`);
      
      toast({
        title: 'Reçu téléchargé',
        description: 'Le reçu PDF a été généré et téléchargé avec succès.',
      });
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
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
