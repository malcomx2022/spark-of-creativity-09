import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Smartphone, Loader2 } from "lucide-react";
import { useGroupSessionRegistration } from "@/hooks/useGroupSessionRegistration";
import { normalizePhoneNumber } from "@/lib/phone-utils";

interface RegisterSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    id: string;
    session_name: string;
    price_per_person: number;
    scheduled_date: string;
    start_time: string;
  };
}

export function RegisterSessionDialog({ open, onOpenChange, session }: RegisterSessionDialogProps) {
  const { register, isRegistering } = useGroupSessionRegistration();
  const [paymentMethod, setPaymentMethod] = useState("mobile_money");
  const [phoneNumber, setPhoneNumber] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const formattedPhone = normalizePhoneNumber(phoneNumber);
    if (!formattedPhone) {
      return;
    }

    register({
      sessionId: session.id,
      amount: session.price_per_person,
      paymentMethod,
      phoneNumber: formattedPhone,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inscription à la séance</DialogTitle>
          <DialogDescription>
            {session.session_name} - {session.price_per_person.toLocaleString()} FCFA
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-method">Moyen de paiement *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mobile_money">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Mobile Money
                  </div>
                </SelectItem>
                <SelectItem value="card">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Carte bancaire
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Numéro de téléphone *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+229 XX XX XX XX"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Format: +229 suivi de 8 chiffres
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>Prix de la séance</span>
              <span className="font-semibold">{session.price_per_person.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Commission plateforme (30%)</span>
              <span>{Math.round(session.price_per_person * 0.30).toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Frais de paiement (7%)</span>
              <span>{Math.round(session.price_per_person * 0.07).toLocaleString()} FCFA</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total à payer</span>
              <span className="text-primary">{session.price_per_person.toLocaleString()} FCFA</span>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isRegistering}
          >
            {isRegistering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inscription en cours...
              </>
            ) : (
              "Procéder au paiement"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
