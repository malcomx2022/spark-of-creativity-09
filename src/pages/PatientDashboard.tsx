import Header from '@/components/Header';
import { AppointmentCard } from '@/components/AppointmentCard';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import GPSTracking from '@/components/GPSTracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Activity, Calendar, Clock, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useCreateAppointment, useMutateAppointment, usePatientAppointments } from '@/hooks/useAppointments';
import type { CreateAppointmentData } from '@/types/appointment';
import { Loader2 } from 'lucide-react';

export default function PatientDashboard() {
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const patientId = user?.id;
  const patientName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Patient';

  const {
    data: appointments = [],
    isLoading: isLoadingAppointments,
    isError,
  } = usePatientAppointments(patientId);

  const createAppointment = useCreateAppointment(patientId, patientName);
  const mutateAppointment = useMutateAppointment();

  const handleNewAppointment = async (data: CreateAppointmentData) => {
    try {
      await createAppointment.mutateAsync(data);
      toast({
        title: 'Demande envoyée',
        description: 'Votre demande de rendez-vous a été envoyée avec succès.'
      });
    } catch (error) {
      console.error('Erreur lors de la création du rendez-vous', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de créer le rendez-vous pour le moment.',
        variant: 'destructive'
      });
    }
  };

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
      console.error('Erreur lors de l\'annulation du rendez-vous', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'annuler le rendez-vous.',
        variant: 'destructive'
      });
    }
  };

  const upcomingAppointments = appointments.filter(
    apt => apt.status !== 'completed' && apt.status !== 'cancelled'
  );
  const pastAppointments = appointments.filter(
    apt => apt.status === 'completed' || apt.status === 'cancelled'
  );

  const isLoading = isLoadingUser || isLoadingAppointments;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 pt-24">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Chargement de vos rendez-vous...</span>
          </div>
        )}

        {!isLoading && isError && (
          <Card className="mb-6">
            <CardContent className="flex items-center gap-2 text-destructive">
              Une erreur est survenue lors du chargement de vos rendez-vous.
            </CardContent>
          </Card>
        )}

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Mon espace patient</h1>
          <p className="text-muted-foreground">Gérez vos rendez-vous et consultations</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rendez-vous à venir</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingAppointments.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {appointments.filter(apt => apt.status === 'pending').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Consultations totales</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{appointments.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Mes rendez-vous</h2>
          {patientId && (
            <NewAppointmentDialog onSubmit={handleNewAppointment} />
          )}
        </div>

        <Tabs defaultValue="upcoming" className="space-y-6">
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
                    <NewAppointmentDialog onSubmit={handleNewAppointment} />
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
      </main>
    </div>
  );
}
