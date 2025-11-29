import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CareNotesConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  patientName: string;
  appointmentDate: string;
}

export function CareNotesConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  patientName,
  appointmentDate,
}: CareNotesConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer le partage</AlertDialogTitle>
          <AlertDialogDescription>
            Êtes-vous sûr de vouloir partager cette note de soin avec <strong>{patientName}</strong> ?
            <br />
            <br />
            Une notification lui sera envoyée pour le rendez-vous du{" "}
            <strong>{appointmentDate}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Oui, partager</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
