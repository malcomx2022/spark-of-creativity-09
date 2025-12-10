import { GroupSessionPaymentWidget } from "./GroupSessionPaymentWidget";

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
  // Utiliser directement le widget de paiement intégré (comme FedaPayWidget pour les rendez-vous)
  return (
    <GroupSessionPaymentWidget
      open={open}
      onOpenChange={onOpenChange}
      session={session}
      onSuccess={() => {
        console.log('✅ Inscription et paiement réussis');
      }}
      onComplete={() => {
        console.log('✅ Processus complété');
      }}
    />
  );
}
