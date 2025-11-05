import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, User, FileText, Phone } from 'lucide-react';
import type { Appointment } from '@/types/appointment';
import { ContactDialog } from '@/components/ContactDialog';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface AppointmentCardProps {
  appointment: Appointment;
  userRole: 'patient' | 'practitioner';
  onCancel?: (id: string) => void;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  onComplete?: (id: string) => void;
  onPaymentRequired?: (appointmentId: string) => void;
}

export function AppointmentCard({ appointment, userRole, onCancel, onConfirm, onReject, onComplete, onPaymentRequired }: AppointmentCardProps) {
  const { data: user } = useSupabaseUser();
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'awaiting_practitioner':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'in-progress':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'completed':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'cancelled':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'rejected':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmé';
      case 'awaiting_practitioner':
        return 'En attente praticien';
      case 'pending':
        return 'En attente paiement';
      case 'in-progress':
        return 'En cours';
      case 'completed':
        return 'Terminé';
      case 'cancelled':
        return 'Annulé';
      case 'rejected':
        return 'Refusé';
      default:
        return status;
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {userRole === 'patient' ? appointment.practitionerName : appointment.patientName}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{appointment.specialty}</p>
          </div>
          <Badge className={getStatusColor(appointment.status)}>
            {getStatusLabel(appointment.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{new Date(appointment.date).toLocaleDateString('fr-FR', { 
              weekday: 'long', 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{appointment.time} ({appointment.duration} min)</span>
          </div>
          <div className="flex items-center gap-2 text-sm col-span-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{appointment.address}</span>
          </div>
          <div className="flex items-center gap-2 text-sm col-span-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>{appointment.reason}</span>
          </div>
        </div>

        {appointment.notes && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">{appointment.notes}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {userRole === 'practitioner' && appointment.status === 'awaiting_practitioner' && onConfirm && onReject && (
            <>
              <Button onClick={() => onConfirm(appointment.id)} size="sm" className="flex-1">
                Accepter
              </Button>
              <Button onClick={() => onReject(appointment.id)} size="sm" variant="destructive" className="flex-1">
                Refuser
              </Button>
            </>
          )}
          {userRole === 'patient' && appointment.status === 'pending' && onPaymentRequired && (
            <Button onClick={() => onPaymentRequired(appointment.id)} size="sm" className="flex-1">
              Payer
            </Button>
          )}
          {userRole === 'practitioner' && appointment.status === 'confirmed' && onComplete && (
            <Button onClick={() => onComplete(appointment.id)} size="sm" variant="secondary" className="flex-1">
              Terminer
            </Button>
          )}
          {appointment.status !== 'completed' && appointment.status !== 'cancelled' && appointment.status !== 'rejected' && onCancel && (
            <Button onClick={() => onCancel(appointment.id)} size="sm" variant="outline" className="flex-1">
              Annuler
            </Button>
          )}
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1"
            onClick={() => setContactDialogOpen(true)}
          >
            <Phone className="h-4 w-4 mr-1" />
            Contacter
          </Button>
        </div>
      </CardContent>

      {user?.id && (
        <ContactDialog
          open={contactDialogOpen}
          onOpenChange={setContactDialogOpen}
          appointment={appointment}
          userId={user.id}
        />
      )}
    </Card>
  );
}
