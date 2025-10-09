import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Smartphone, CreditCard } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type PaymentMethod = 'mtn' | 'orange' | 'moov';

interface PaymentResponse {
  paymentUrl?: string;
  status?: string;
}

function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/[^0-9+]/g, '');

  if ((normalized.match(/\+/g) ?? []).length > 1) {
    return null;
  }

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+')) {
    normalized = `+${normalized.replace(/\+/g, '')}`;
  }

  const digits = normalized.slice(1);

  if (!/^\d{8,15}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}

function isPaymentResponse(payload: unknown): payload is PaymentResponse {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  const { paymentUrl, status } = candidate;

  if (paymentUrl !== undefined && typeof paymentUrl !== 'string') {
    return false;
  }

  if (status !== undefined && typeof status !== 'string') {
    return false;
  }

  return true;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  amount: number;
  onSuccess?: () => void;
}

export function PaymentDialog({ open, onOpenChange, appointmentId, amount, onSuccess }: PaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = async () => {
    const sanitizedPhoneNumber = normalizePhoneNumber(phoneNumber);

    if (!sanitizedPhoneNumber) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer un numéro de téléphone valide',
        variant: 'destructive',
      });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Montant invalide',
        description: 'Le montant du paiement doit être supérieur à zéro.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: 'Erreur',
          description: 'Vous devez être connecté pour effectuer un paiement',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          appointmentId,
          amount,
          paymentMethod,
          phoneNumber: sanitizedPhoneNumber,
        },
      });

      if (error) {
        console.error('Payment error:', error);
        throw error;
      }

      if (!isPaymentResponse(data)) {
        throw new Error('Réponse inattendue du service de paiement');
      }

      console.log('Payment initiated:', data);

      // Open payment URL in new window
      if (data.paymentUrl) {
        window.open(data.paymentUrl, '_blank');
      }

      toast({
        title: 'Paiement initié',
        description: 'Suivez les instructions sur votre téléphone pour confirmer le paiement',
      });

      onOpenChange(false);
      onSuccess?.();

    } catch (error) {
      console.error('Payment error:', error);
      const message = error instanceof Error ? error.message : 'Une erreur est survenue lors du paiement';
      toast({
        title: 'Erreur de paiement',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Paiement du rendez-vous
          </DialogTitle>
          <DialogDescription>
            Montant à payer : <span className="font-bold text-lg">{formatAmount(amount)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Choisissez votre opérateur</Label>
            <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
              <div className="flex items-center space-x-2 rounded-lg border p-4 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="mtn" id="mtn" />
                <Label htmlFor="mtn" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-yellow-500" />
                    <div>
                      <div className="font-semibold">MTN Mobile Money</div>
                      <div className="text-sm text-muted-foreground">Paiement via MTN MoMo</div>
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 rounded-lg border p-4 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="orange" id="orange" />
                <Label htmlFor="orange" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-orange-500" />
                    <div>
                      <div className="font-semibold">Orange Money</div>
                      <div className="text-sm text-muted-foreground">Paiement via Orange Money</div>
                    </div>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 rounded-lg border p-4 cursor-pointer hover:bg-accent">
                <RadioGroupItem value="moov" id="moov" />
                <Label htmlFor="moov" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="font-semibold">Moov Money</div>
                      <div className="text-sm text-muted-foreground">Paiement via Moov Money</div>
                    </div>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Numéro de téléphone</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="Ex: 01 23 45 67 89"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={isProcessing}
            />
            <p className="text-sm text-muted-foreground">
              Entrez le numéro associé à votre compte Mobile Money
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            onClick={handlePayment}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Traitement...
              </>
            ) : (
              `Payer ${formatAmount(amount)}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
