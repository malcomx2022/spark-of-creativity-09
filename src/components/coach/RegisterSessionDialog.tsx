import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentDialog } from "@/components/PaymentDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface RegisterSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    id: string;
    session_name: string;
    price_per_person: number;
    scheduled_date: string;
    start_time: string;
    current_participants?: number;
    max_participants?: number;
  };
}

export function RegisterSessionDialog({ open, onOpenChange, session }: RegisterSessionDialogProps) {
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const handleProceedToPayment = () => {
    onOpenChange(false); // Fermer le dialog d'inscription
    setShowPaymentDialog(true); // Ouvrir le dialog de paiement
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inscription à la séance</DialogTitle>
            <DialogDescription>
              {session.session_name} - {session.price_per_person.toLocaleString()} FCFA
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Détails de la séance</h4>
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Date:</span>{" "}
                  {format(new Date(session.scheduled_date), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
                <p>
                  <span className="text-muted-foreground">Heure:</span> {session.start_time}
                </p>
                {session.current_participants !== undefined && session.max_participants && (
                  <p>
                    <span className="text-muted-foreground">Places:</span>{" "}
                    {session.current_participants} / {session.max_participants} participants
                  </p>
                )}
              </div>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Prix de la séance</span>
                <span className="font-semibold">{session.price_per_person.toLocaleString()} FCFA</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total à payer</span>
                <span className="text-primary">{session.price_per_person.toLocaleString()} FCFA</span>
              </div>
            </div>

            <button 
              onClick={handleProceedToPayment}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Procéder au paiement
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        sessionId={session.id}
        amount={session.price_per_person}
        context="group_session"
        sessionDetails={session}
        onSuccess={() => {
          setShowPaymentDialog(false);
          onOpenChange(false);
        }}
        onComplete={() => {
          setShowPaymentDialog(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
