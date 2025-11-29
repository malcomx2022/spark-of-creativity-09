import { useState, useMemo } from "react";
import { CardDescription, Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/AppointmentCard";
import { Calendar } from "lucide-react";

interface AppointmentsTabProps {
  appointments: any[];
  isLoadingAppointments: boolean;
  processingAppointment: string | null;
  onAcceptAppointment: (id: string) => void;
  onRejectAppointment: (id: string) => void;
}

export default function AppointmentsTab({
  appointments,
  isLoadingAppointments,
  processingAppointment,
  onAcceptAppointment,
  onRejectAppointment,
}: AppointmentsTabProps) {
  const [completedLimit, setCompletedLimit] = useState(5);

  // Memoize categorized appointments
  const categorizedAppointments = useMemo(() => ({
    pending: appointments?.filter(a => a.status === 'pending') || [],
    confirmed: appointments?.filter(a => a.status === 'confirmed' || a.status === 'in-progress') || [],
    completed: appointments?.filter(a => a.status === 'completed') || [],
  }), [appointments]);

  if (isLoadingAppointments) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Chargement des rendez-vous...</p>
      </div>
    );
  }

  const totalAppointments = appointments?.length || 0;
  const hasAppointments = totalAppointments > 0;

  if (!hasAppointments) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            Aucun rendez-vous pour le moment
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Rendez-vous individuels</h2>
        <CardDescription>Gérez vos consultations et coachings individuels</CardDescription>
      </div>

      {/* Rendez-vous en attente */}
      {categorizedAppointments.pending.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">En attente de validation</h3>
          <div className="grid gap-4">
            {categorizedAppointments.pending.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                userRole="practitioner"
                onConfirm={() => onAcceptAppointment(appointment.id)}
                onReject={() => onRejectAppointment(appointment.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rendez-vous confirmés */}
      {categorizedAppointments.confirmed.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Confirmés</h3>
          <div className="grid gap-4">
            {categorizedAppointments.confirmed.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                userRole="practitioner"
              />
            ))}
          </div>
        </div>
      )}

      {/* Rendez-vous terminés */}
      {categorizedAppointments.completed.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Terminés</h3>
            <p className="text-sm text-muted-foreground">
              Affichage {Math.min(completedLimit, categorizedAppointments.completed.length)} sur {categorizedAppointments.completed.length} consultations
            </p>
          </div>
          <div className="grid gap-4">
            {categorizedAppointments.completed
              .slice(0, completedLimit)
              .map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="practitioner"
                />
              ))}
          </div>
          {completedLimit < categorizedAppointments.completed.length && (
            <Button
              variant="outline"
              onClick={() => setCompletedLimit(prev => prev + 5)}
              className="w-full"
            >
              Voir plus
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
