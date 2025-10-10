import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  TrendingUp, 
  Loader2,
  User,
  DollarSign,
  FileText,
  Star,
  MessageSquare,
  HelpCircle,
  Shield
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useMutateAppointment, usePractitionerAppointments } from '@/hooks/useAppointments';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import ProfessionalProfileSection from '@/components/dashboard/practitioner/ProfessionalProfileSection';
import AvailabilitySection from '@/components/dashboard/practitioner/AvailabilitySection';
import PayoutsSection from '@/components/dashboard/practitioner/PayoutsSection';
import CareNotesSection from '@/components/dashboard/practitioner/CareNotesSection';
import ReviewsSection from '@/components/dashboard/practitioner/ReviewsSection';
import { NotificationsSection } from '@/components/dashboard/NotificationsSection';
import { PractitionerMessagesSection } from '@/components/dashboard/practitioner/PractitionerMessagesSection';
import { SupportSection } from '@/components/dashboard/SupportSection';

export default function PractitionerDashboard() {
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const { toast } = useToast();
  const practitionerId = user?.id;
  const practitionerName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Praticien';

  // Récupérer les données du praticien
  const { data: practitioner, isLoading: practitionerLoading } = useQuery({
    queryKey: ["practitioner", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("practitioners")
        .select("*")
        .eq("user_id", user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const {
    data: appointments = [],
    isLoading: isLoadingAppointments,
    isError,
  } = usePractitionerAppointments(practitioner?.id);

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
  const isLoading = isLoadingUser || isLoadingAppointments || practitionerLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Chargement...</span>
        </div>
      </div>
    );
  }

  if (!practitioner) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 p-6">
        <div className="container mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Profil praticien introuvable</CardTitle>
              <CardDescription>
                Veuillez compléter votre inscription en tant que praticien.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 mt-20">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Tableau de bord Praticien</h1>
          <p className="text-muted-foreground">Bienvenue, {practitioner.name}</p>
        </div>

        {/* Cartes de résumé */}
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

        <Tabs defaultValue="appointments" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-9">
            <TabsTrigger value="appointments" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">RDV</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profil</span>
            </TabsTrigger>
            <TabsTrigger value="availability" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Disponibilités</span>
            </TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Paiements</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Notes</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="gap-2">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Avis</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="support" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Support</span>
            </TabsTrigger>
          </TabsList>

          {/* Onglet Rendez-vous */}
          <TabsContent value="appointments" className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Mes consultations</h2>
              <CardDescription>Confirmez, terminez ou annulez vos rendez-vous en un clic.</CardDescription>
            </div>

            <Tabs defaultValue="pending">
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

              <TabsContent value="pending" className="space-y-4 mt-4">
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

              <TabsContent value="confirmed" className="space-y-4 mt-4">
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

              <TabsContent value="completed" className="space-y-4 mt-4">
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
          </TabsContent>

          <TabsContent value="profile">
            <ProfessionalProfileSection
              practitionerId={practitioner.id}
              practitionerData={practitioner}
            />
          </TabsContent>

          <TabsContent value="availability">
            <AvailabilitySection
              practitionerId={practitioner.id}
              practitionerData={practitioner}
            />
          </TabsContent>

          <TabsContent value="payouts">
            <PayoutsSection practitionerId={practitioner.id} />
          </TabsContent>

          <TabsContent value="notes">
            <CareNotesSection />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewsSection practitionerId={practitioner.id} />
          </TabsContent>

          <TabsContent value="messages">
            <PractitionerMessagesSection />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsSection />
          </TabsContent>

          <TabsContent value="support">
            <SupportSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
