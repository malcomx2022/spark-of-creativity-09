import Header from '@/components/Header';
import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, CheckCircle2, AlertCircle, TrendingUp, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useMutateAppointment, usePractitionerAppointments } from '@/hooks/useAppointments';

export default function PractitionerDashboard() {
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const practitionerId = user?.id;
  const practitionerName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Praticien';

  const {
    data: appointments = [],
    isLoading: isLoadingAppointments,
    isError,
  } = usePractitionerAppointments(practitionerId);

  const mutateAppointment = useMutateAppointment();

  const handleStatusUpdate = async (id: string, status: 'confirmed' | 'completed' | 'cancelled') => {
    if (!practitionerId) {
      toast({
        title: 'Action impossible',
        description: 'Vous devez être connecté pour modifier un rendez-vous.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await mutateAppointment.mutateAsync({
        id,
        data: {
          status,
          practitioner_id: practitionerId,
          practitioner_name: practitionerName,
        }
      });

      const messages = {
        confirmed: {
          title: 'Rendez-vous confirmé',
          description: 'Le patient a été notifié de la confirmation.'
        },
        completed: {
          title: 'Consultation terminée',
          description: 'Le rendez-vous a été marqué comme terminé.'
        },
        cancelled: {
          title: 'Rendez-vous annulé',
          description: 'Le patient a été notifié de l\'annulation.',
          variant: 'destructive' as const
        }
      } as const;

      toast(messages[status]);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du rendez-vous', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le rendez-vous.',
        variant: 'destructive'
      });
    }
  };

  const pendingAppointments = appointments.filter(apt => apt.status === 'pending');
  const confirmedAppointments = appointments.filter(apt => apt.status === 'confirmed');
  const completedAppointments = appointments.filter(apt => apt.status === 'completed');
  const isLoading = isLoadingUser || isLoadingAppointments;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 pt-24">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Chargement de vos consultations...</span>
          </div>
        )}

        {!isLoading && isError && (
          <Card className="mb-6">
            <CardContent className="flex items-center gap-2 text-destructive">
              Impossible de charger vos consultations pour le moment.
            </CardContent>
          </Card>
        )}

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Espace praticien</h1>
          <p className="text-muted-foreground">Gérez vos consultations à domicile</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingAppointments.length}</div>
              <p className="text-xs text-muted-foreground">À confirmer</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Confirmés</CardTitle>
              <Calendar className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{confirmedAppointments.length}</div>
              <p className="text-xs text-muted-foreground">À venir</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Terminés</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedAppointments.length}</div>
              <p className="text-xs text-muted-foreground">Ce mois</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Temps total</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {appointments.reduce((acc, apt) => acc + apt.duration, 0)} min
              </div>
              <p className="text-xs text-muted-foreground">Ce mois</p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold">Mes consultations</h2>
          <CardDescription>Confirmez, terminez ou annulez vos rendez-vous en un clic.</CardDescription>
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">
              En attente ({pendingAppointments.length})
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              Confirmés ({confirmedAppointments.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Terminés ({completedAppointments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingAppointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucune demande en attente</p>
                </CardContent>
              </Card>
            ) : (
              pendingAppointments.map(appointment => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="practitioner"
                  onConfirm={() => handleStatusUpdate(appointment.id, 'confirmed')}
                  onCancel={() => handleStatusUpdate(appointment.id, 'cancelled')}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="confirmed" className="space-y-4">
            {confirmedAppointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucun rendez-vous confirmé</p>
                </CardContent>
              </Card>
            ) : (
              confirmedAppointments.map(appointment => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="practitioner"
                  onComplete={() => handleStatusUpdate(appointment.id, 'completed')}
                  onCancel={() => handleStatusUpdate(appointment.id, 'cancelled')}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedAppointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucune consultation terminée</p>
                </CardContent>
              </Card>
            ) : (
              completedAppointments.map(appointment => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="practitioner"
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
