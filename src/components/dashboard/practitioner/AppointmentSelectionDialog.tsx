import type { Appointment } from "@/types/appointment";
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar, AlertCircle } from 'lucide-react';
import { usePractitionerAppointments } from '@/hooks/useAppointments';
import { useConsultationReportByAppointment } from '@/hooks/useConsultationReports';

interface AppointmentSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitionerId: string;
  onSelectAppointment: (appointmentId: string, patientName: string, appointmentDate: string) => void;
}

export const AppointmentSelectionDialog = ({
  open,
  onOpenChange,
  practitionerId,
  onSelectAppointment,
}: AppointmentSelectionDialogProps) => {
  const { data: appointmentsResult, isLoading } = usePractitionerAppointments(practitionerId, 0, 100);
  
  // Filtrer uniquement les rendez-vous complétés
  const completedAppointments = (appointmentsResult?.data || []).filter(
    apt => apt.status === 'completed'
  );

  // Composant pour chaque rendez-vous avec vérification de rapport existant
  const AppointmentItem = ({ appointment }: { appointment: Appointment }) => {
    const { data: existingReport } = useConsultationReportByAppointment(appointment.id);
    const hasReport = !!existingReport;

    return (
      <div
        className={`border rounded-lg p-4 ${
          hasReport ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary'
        }`}
        onClick={() => {
          if (!hasReport) {
            onSelectAppointment(appointment.id, appointment.patientName, appointment.date);
          }
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-medium">{appointment.patientName}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(appointment.date), 'dd MMMM yyyy', { locale: fr })} à {appointment.time}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{appointment.reason}</p>
          </div>
          {hasReport ? (
            <Badge variant="outline" className="border-green-500 text-green-700">
              Rapport créé
            </Badge>
          ) : (
            <Badge variant="outline">Sans rapport</Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sélectionner une consultation</DialogTitle>
          <DialogDescription>
            Choisissez une consultation terminée pour créer un rapport
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : completedAppointments.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Aucune consultation terminée pour le moment
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {completedAppointments.map((appointment) => (
              <AppointmentItem key={appointment.id} appointment={appointment} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
