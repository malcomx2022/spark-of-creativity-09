import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Ban, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export function SandboxPaymentTester() {
  const [paymentId, setPaymentId] = useState('');
  const [action, setAction] = useState<'approve' | 'decline' | 'cancel'>('approve');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Récupérer les paiements en attente
  const { data: pendingPayments, refetch } = useQuery({
    queryKey: ['pending-payments-sandbox'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, currency, status, fedapay_transaction_id, created_at, appointment_id')
        .in('status', ['initiated', 'pending'])
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    }
  });

  const simulateWebhook = async () => {
    if (!paymentId) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner un paiement',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('simulate-webhook', {
        body: { paymentId, action }
      });

      if (error) throw error;

      toast({
        title: 'Webhook simulé avec succès',
        description: `Le paiement a été ${action === 'approve' ? 'approuvé' : action === 'decline' ? 'refusé' : 'annulé'}`,
      });

      refetch();
      setPaymentId('');
    } catch (error: any) {
      console.error('Error simulating webhook:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de simuler le webhook',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = () => {
    switch (action) {
      case 'approve': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'decline': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'cancel': return <Ban className="h-4 w-4 text-orange-600" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🧪 Testeur de Paiements Sandbox
        </CardTitle>
        <CardDescription>
          Simulez les webhooks FedaPay pour tester les paiements en mode sandbox
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <strong>Mode Sandbox uniquement:</strong> Cet outil simule les webhooks FedaPay pour approuver/refuser les paiements test. 
            En production, FedaPay envoie automatiquement ces webhooks.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Paiements en attente</Label>
            {pendingPayments && pendingPayments.length > 0 ? (
              <div className="space-y-2">
                {pendingPayments.map((payment) => (
                  <div 
                    key={payment.id}
                    className={`p-3 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors ${
                      paymentId === payment.id ? 'bg-muted border-primary' : ''
                    }`}
                    onClick={() => setPaymentId(payment.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="font-mono text-sm">{payment.id}</div>
                        <div className="text-sm text-muted-foreground">
                          Montant: {payment.amount} {payment.currency}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Transaction: {payment.fedapay_transaction_id || 'N/A'}
                        </div>
                      </div>
                      <div className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                        {payment.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground p-4 border rounded-md text-center">
                Aucun paiement en attente
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Ou entrez un ID de paiement</Label>
            <Input
              placeholder="ID du paiement"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Action à simuler</Label>
            <Select value={action} onValueChange={(v) => setAction(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approve">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Approuver le paiement
                  </div>
                </SelectItem>
                <SelectItem value="decline">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    Refuser le paiement
                  </div>
                </SelectItem>
                <SelectItem value="cancel">
                  <div className="flex items-center gap-2">
                    <Ban className="h-4 w-4 text-orange-600" />
                    Annuler le paiement
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={simulateWebhook} 
            disabled={loading || !paymentId}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Simulation en cours...
              </>
            ) : (
              <>
                {getActionIcon()}
                <span className="ml-2">Simuler le webhook</span>
              </>
            )}
          </Button>
        </div>

        <Alert>
          <AlertDescription className="text-xs space-y-2">
            <div><strong>💡 Astuce:</strong> En production, utilisez les vrais numéros de téléphone FedaPay.</div>
            <div>En sandbox, vous pouvez:</div>
            <ul className="list-disc list-inside ml-2">
              <li>Approuver manuellement dans le dashboard FedaPay</li>
              <li>Utiliser cet outil pour tester rapidement</li>
            </ul>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
