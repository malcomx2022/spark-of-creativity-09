import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Download, Edit } from 'lucide-react';
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

export function PaymentsSection() {
  const { data: user } = useSupabaseUser();
  const [isPaymentMethodDialogOpen, setIsPaymentMethodDialogOpen] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isReceiptDialogOpen, setIsReceiptDialogOpen] = useState(false);

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ['payments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      pending: 'secondary',
      failed: 'destructive',
      cancelled: 'outline',
    };
    return variants[status] || 'outline';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      completed: 'Complété',
      pending: 'En attente',
      failed: 'Échec',
      cancelled: 'Annulé',
    };
    return labels[status] || status;
  };

  const handleSavePaymentMethod = () => {
    if (!phoneNumber || phoneNumber.length < 8) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer un numéro de téléphone valide',
        variant: 'destructive',
      });
      return;
    }

    // TODO: Enregistrer le moyen de paiement dans la base de données
    toast({
      title: 'Moyen de paiement enregistré',
      description: `${paymentProvider.toUpperCase()} - ${phoneNumber}`,
    });
    setIsPaymentMethodDialogOpen(false);
    setPhoneNumber('');
  };

  const handleExportPayments = () => {
    if (payments.length === 0) {
      toast({
        title: 'Aucune donnée',
        description: 'Aucun paiement à exporter',
        variant: 'destructive',
      });
      return;
    }

    // Créer un CSV
    const headers = ['Date', 'Montant', 'Devise', 'Mode de paiement', 'Statut'];
    const csvContent = [
      headers.join(','),
      ...payments.map(payment => [
        new Date(payment.created_at).toLocaleDateString('fr-FR'),
        payment.amount,
        payment.currency,
        payment.payment_method.toUpperCase(),
        getStatusLabel(payment.status),
      ].join(',')),
    ].join('\n');

    // Télécharger le fichier
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `paiements_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Export réussi',
      description: 'Vos paiements ont été exportés',
    });
  };

  return (
    <div className="space-y-6">
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
                  className="flex justify-between items-center p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {payment.amount} {payment.currency}
                      </p>
                      <Badge variant={getStatusBadge(payment.status)}>
                        {getStatusLabel(payment.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Mode: {payment.payment_method.toUpperCase()}
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
                   </div>
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
               ))}
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
             Modes de paiement acceptés : MTN Mobile Money, Orange Money, Moov Money
           </p>
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
               Enregistrez votre numéro de téléphone pour les paiements mobile money
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
                   <SelectItem value="orange">Orange Money</SelectItem>
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
