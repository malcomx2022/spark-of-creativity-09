import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import { AppointmentCard } from '@/components/AppointmentCard';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import GPSTracking from '@/components/GPSTracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Calendar, Clock, FileText, User, Heart, CreditCard, Bell, MessageSquare, Star, HelpCircle, Shield, ClipboardCheck, AlertCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useCreateAppointment, useMutateAppointment, usePatientAppointments } from '@/hooks/useAppointments';
import type { CreateAppointmentData } from '@/types/appointment';
import { Loader2 } from 'lucide-react';
import { ProfileSection } from '@/components/dashboard/ProfileSection';
import { MedicalSection } from '@/components/dashboard/MedicalSection';
import { PaymentsSection } from '@/components/dashboard/PaymentsSection';
import { NotificationsSection } from '@/components/dashboard/NotificationsSection';
import { MessagesSection } from '@/components/dashboard/MessagesSection';
import { ReviewsSection } from '@/components/dashboard/ReviewsSection';
import { SupportSection } from '@/components/dashboard/SupportSection';
import { TriageForm } from '@/components/TriageForm';
import { PatientConsultationReportsSection } from '@/components/dashboard/PatientConsultationReportsSection';
import { PaymentDialog } from '@/components/PaymentDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { completePatientOnboardingFromMetadata } from '@/lib/patient-onboarding';
import { formatAmount } from '@/lib/payment-config';
import { getPersistedPaymentState } from '@/lib/payment-storage';

export default function PatientDashboard() {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [appointmentIdForPayment, setAppointmentIdForPayment] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const patientId = user?.id;
  const patientName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Patient';

  useEffect(() => {
    const persisted = getPersistedPaymentState();

    if (persisted?.paymentStatus !== 'pending') {
      return;
    }

    // Vérifier si le paiement n'est pas expiré (5 minutes)
    const elapsed = Date.now() - persisted.lastUpdated;
    const MAX_AGE = 5 * 60 * 1000; // 5 minutes

    if (elapsed > MAX_AGE) {
      console.log('⚠️ Paiement en attente expiré, abandon de la réhydratation');
      return;
    }

    console.log('🔄 Réhydratation d\'un paiement en cours:', persisted.appointmentId);
    
    setAppointmentIdForPayment(persisted.appointmentId);
    setPaymentAmount(persisted.amount);
    setPaymentDialogOpen(true);

    // Informer l'utilisateur avec un toast
    toast({
      title: '💳 Paiement en attente',
      description: 'Vous avez un paiement en cours. Veuillez le compléter pour confirmer votre rendez-vous.',
      duration: 8000,
    });
  }, []);

  const {
    data: appointments = [],
    isLoading: isLoadingAppointments,
    isError,
  } = usePatientAppointments(patientId);

  const createAppointment = useCreateAppointment(patientId, patientName);
  const mutateAppointment = useMutateAppointment();

  const { data: payments } = useQuery({
    queryKey: ['payments', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('patient_id', patientId);
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await completePatientOnboardingFromMetadata(user);
        if (!cancelled && result.completed) {
          toast({
            title: 'Profil patient mis à jour',
            description: 'Vos informations ont été synchronisées avec succès.',
          });
          queryClient.invalidateQueries({ queryKey: ['supabase', 'auth', 'user'] });
        }
      } catch (error) {
        console.error('Erreur lors de la finalisation du profil patient', error);
        if (!cancelled) {
          toast({
            title: 'Synchronisation du profil impossible',
            description: 'Réessayez après avoir actualisé la page.',
            variant: 'destructive',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, queryClient]);

  const handleNewAppointment = async (data: CreateAppointmentData) => {
    console.log('🟢 handleNewAppointment appelé avec:', data);
    console.log('🟢 Patient ID:', patientId);
    console.log('🟢 Patient Name:', patientName);
    
    try {
      console.log('🟢 Appel de createAppointment.mutateAsync...');
      const result = await createAppointment.mutateAsync(data);
      console.log('✅ Rendez-vous créé:', result);
      toast({
        title: 'Rendez-vous créé',
        description: 'Votre rendez-vous a été créé. Veuillez procéder au paiement pour le confirmer.'
      });
      return result; // Retourner le rendez-vous créé avec son ID
    } catch (error) {
      console.error('❌ Erreur lors de la création du rendez-vous:', error);
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Impossible de créer le rendez-vous pour le moment.',
        variant: 'destructive'
      });
      throw error; // Propager l'erreur pour arrêter le processus
    }
  };

  const handlePaymentRequired = async (appointmentId: string) => {
    try {
      console.log('💳 Ouverture du dialogue de paiement pour:', appointmentId);
      const appointment = appointments.find((apt) => apt.id === appointmentId);

      if (!appointment) {
        throw new Error('Rendez-vous introuvable');
      }

      let amount = appointment.paymentAmount ?? null;

      if (amount === null) {
        const { data: refreshed, error: refreshError } = await supabase
          .from('appointments')
          .select('payment_amount, practitioner_id, specialty')
          .eq('id', appointmentId)
          .maybeSingle();

        if (refreshError) throw refreshError;

        amount = refreshed?.payment_amount ?? null;

        if (amount === null && refreshed?.practitioner_id) {
          const { data: rate, error: rateError } = await supabase
            .from('practitioner_rates')
            .select('base_price')
            .eq('practitioner_id', refreshed.practitioner_id)
            .eq('service_type', refreshed.specialty)
            .maybeSingle();

          if (rateError) throw rateError;

          amount = rate?.base_price ?? null;

          if (amount === null) {
            const { data: service, error: serviceError } = await supabase
              .from('services')
              .select('base_price')
              .eq('name', refreshed.specialty)
              .maybeSingle();

            if (serviceError) throw serviceError;

            amount = service?.base_price ?? null;
          }
        }
      }

      if (amount === null) {
        throw new Error('Impossible de déterminer le montant à payer pour ce rendez-vous');
      }

      setPaymentAmount(amount);
      setAppointmentIdForPayment(appointmentId);
      setPaymentDialogOpen(true);
    } catch (error) {
      console.error('Erreur lors de la préparation du paiement', error);
      toast({
        title: 'Montant indisponible',
        description: error instanceof Error ? error.message : 'Veuillez réessayer ultérieurement.',
        variant: 'destructive',
      });
    }
  };

  const handlePaymentSuccess = useCallback(() => {
    console.log('✅ Paiement réussi');
    setPaymentDialogOpen(false);
    setAppointmentIdForPayment(null);
    setPaymentAmount(null);

    queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', patientId] });
    queryClient.invalidateQueries({ queryKey: ['payments', patientId] });
  }, [patientId, queryClient]);

  const handlePaymentDialogOpenChange = (open: boolean) => {
    setPaymentDialogOpen(open);
    if (!open) {
      setAppointmentIdForPayment(null);
      setPaymentAmount(null);
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

  const confirmedAwaitingPayment = appointments?.filter(
    apt => apt.status === 'confirmed' && !payments?.some(p => p.appointment_id === apt.id && p.status === 'paid')
  ) || [];

  const upcomingAppointments = appointments.filter(
    apt => apt.status !== 'completed' && apt.status !== 'cancelled' && apt.status !== 'rejected'
  );
  const pastAppointments = appointments.filter(
    apt => apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'rejected'
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
                  {appointments.filter(apt => apt.status === 'awaiting_practitioner' || apt.status === 'confirmed').length}
                </div>
              </CardContent>
            </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Consultations totales</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {appointments.filter(apt => apt.status === 'completed').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bannière de paiement en attente */}
        {confirmedAwaitingPayment.length > 0 && (
          <Alert className="mb-6 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 ml-2">
              <div>
                <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                  Paiement en attente
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-200 mt-1">
                  Vous avez {confirmedAwaitingPayment.length} rendez-vous confirmé(s) en attente de paiement. 
                  Complétez le paiement pour finaliser votre réservation.
                </p>
              </div>
              <Button 
                onClick={() => handlePaymentRequired(confirmedAwaitingPayment[0].id)}
                className="shrink-0"
                variant="default"
              >
                Payer maintenant
              </Button>
            </div>
          </Alert>
        )}

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Mes rendez-vous</h2>
          {patientId && (
            <NewAppointmentDialog 
              onSubmit={handleNewAppointment}
            />
          )}
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-3 lg:grid-cols-11 gap-2">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Accueil</span>
            </TabsTrigger>
            <TabsTrigger value="appointments" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">RDV</span>
            </TabsTrigger>
            <TabsTrigger value="triage" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Triage</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Rapports</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profil</span>
            </TabsTrigger>
            <TabsTrigger value="medical" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              <span className="hidden sm:inline">Médical</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Paiements</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifs</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Avis</span>
            </TabsTrigger>
            <TabsTrigger value="support" className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Aide</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    {appointments.filter(apt => apt.status === 'awaiting_practitioner' || apt.status === 'confirmed').length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Consultations totales</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {appointments.filter(apt => apt.status === 'completed').length}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Prochains rendez-vous</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">Aucun rendez-vous à venir</p>
                    {patientId && (
                      <NewAppointmentDialog 
                        onSubmit={handleNewAppointment}
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {upcomingAppointments.slice(0, 3).map(appointment => (
                      <div key={appointment.id} className="space-y-4">
                        <AppointmentCard
                          appointment={appointment}
                          userRole="patient"
                          onCancel={handleCancel}
                          onPaymentRequired={handlePaymentRequired}
                        />
                        {appointment.status === 'confirmed' && (
                          <GPSTracking appointment={appointment} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments" className="space-y-6">
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
                          onClick={() => handlePaymentRequired(appointment.id)}
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
                  onSubmit={handleNewAppointment}
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
                          onSubmit={handleNewAppointment}
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
                          onPaymentRequired={handlePaymentRequired}
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
          </TabsContent>

          <TabsContent value="triage">
            <TriageForm />
          </TabsContent>

          <TabsContent value="reports">
            <PatientConsultationReportsSection />
          </TabsContent>

          <TabsContent value="profile">
            <ProfileSection />
          </TabsContent>

          <TabsContent value="medical">
            <MedicalSection />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentsSection />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsSection />
          </TabsContent>

          <TabsContent value="messages">
            <MessagesSection />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewsSection />
          </TabsContent>

          <TabsContent value="support">
            <SupportSection />
          </TabsContent>
        </Tabs>
      </main>

      {/* Payment Dialog - géré au niveau du dashboard */}
      {appointmentIdForPayment && paymentAmount !== null && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={handlePaymentDialogOpenChange}
          appointmentId={appointmentIdForPayment}
          amount={paymentAmount}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
