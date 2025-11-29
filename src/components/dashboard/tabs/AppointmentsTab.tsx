import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import GPSTracking from '@/components/GPSTracking';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePatientAppointments, useMutateAppointment, useCreateAppointment } from '@/hooks/useAppointments';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, Calendar, Clock, CreditCard, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAmount } from '@/lib/payment-config';

interface AppointmentsTabProps {
  onPaymentRequired: (appointmentId: string) => void;
}

export default function AppointmentsTab({ onPaymentRequired }: AppointmentsTabProps) {
  const { data: user } = useSupabaseUser();
  const patientId = user?.id;
  const patientName = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Patient';
  
  const { data: appointmentsResult, isLoading } = usePatientAppointments(patientId, 0, 100);
  const appointments = appointmentsResult?.data || [];
  const mutateAppointment = useMutateAppointment();
  const createAppointment = useCreateAppointment(patientId, patientName);

  const { data: payments } = useQuery({
    queryKey: ['payments', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('id, appointment_id, status, payout_status')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  const handleCancel = async (id: string) => {
    try {
      await mutateAppointment.mutateAsync({
        id,
        data: { status: 'cancelled' }
      });
      toast({
        title: 'Rendez-vous annulé',
        description: 'Le rendez-vous a été annulé avec succès.'
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'annuler le rendez-vous.',
        variant: 'destructive'
      });
    }
  };

  const confirmedAwaitingPayment = appointments?.filter(apt => {
    if (apt.status === 'pending_payment') return true;
    if (apt.status === 'confirmed') {
      const hasSuccessfulPayment = payments?.some(p => 
        p.appointment_id === apt.id && 
        (p.status === 'paid' || p.status === 'authorized' || p.payout_status === 'paid' || p.payout_status === 'ready')
      );
      return !hasSuccessfulPayment;
    }
    return false;
  }) || [];

  const upcomingAppointments = appointments.filter(
    apt => apt.status !== 'completed' && apt.status !== 'cancelled' && apt.status !== 'rejected'
  );
  const pastAppointments = appointments.filter(
    apt => apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'rejected'
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmedAwaitingPayment.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Paiement requis ({confirmedAwaitingPayment.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Les praticiens ont accepté ces rendez-vous. Procédez au paiement pour finaliser.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {confirmedAwaitingPayment.map(appointment => (
              <div key={appointment.id} className="p-4 bg-background rounded-lg border space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{appointment.practitionerName}</p>
                    <p className="text-sm text-muted-foreground">{appointment.specialty}</p>
                  </div>
                  <Badge variant="destructive">Paiement requis</Badge>
                </div>
                {typeof appointment.paymentAmount === 'number' && (
                  <p className="text-sm font-semibold">{formatAmount(appointment.paymentAmount)}</p>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{new Date(appointment.date).toLocaleDateString('fr-FR')} à {appointment.time}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onPaymentRequired(appointment.id)}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Payer maintenant
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancel(appointment.id)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Mes rendez-vous</h3>
        {patientId && (
          <NewAppointmentDialog 
            onSubmit={async (data) => {
              try {
                const result = await createAppointment.mutateAsync(data);
                toast({
                  title: 'Rendez-vous créé',
                  description: 'Votre rendez-vous a été créé. Veuillez procéder au paiement pour le confirmer.'
                });
                return result;
              } catch (error) {
                toast({
                  title: 'Erreur',
                  description: error instanceof Error ? error.message : 'Impossible de créer le rendez-vous.',
                  variant: 'destructive'
                });
                throw error;
              }
            }}
          />
        )}
      </div>
      
      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList>
          <TabsTrigger value="upcoming">À venir</TabsTrigger>
          <TabsTrigger value="past">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          {upcomingAppointments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Aucun rendez-vous à venir</p>
                {patientId && (
                  <NewAppointmentDialog 
                    onSubmit={async (data) => {
                      try {
                        const result = await createAppointment.mutateAsync(data);
                        toast({
                          title: 'Rendez-vous créé',
                          description: 'Votre rendez-vous a été créé.'
                        });
                        return result;
                      } catch (error) {
                        toast({
                          title: 'Erreur',
                          description: 'Impossible de créer le rendez-vous.',
                          variant: 'destructive'
                        });
                        throw error;
                      }
                    }}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {upcomingAppointments.map(appointment => (
                <div key={appointment.id} className="space-y-4">
                  <AppointmentCard
                    appointment={appointment}
                    userRole="patient"
                    onCancel={handleCancel}
                    onPaymentRequired={onPaymentRequired}
                  />
                  {appointment.status === 'confirmed' && (
                    <GPSTracking appointment={appointment} />
                  )}
                </div>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          {pastAppointments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucun rendez-vous passé</p>
              </CardContent>
            </Card>
          ) : (
            pastAppointments.map(appointment => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                userRole="patient"
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

