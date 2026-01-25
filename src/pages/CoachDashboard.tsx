import { useState, useMemo, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  User,
  Bell,
  HelpCircle,
  Users,
  DollarSign,
  ClipboardList,
  Loader2,
  Wallet
} from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useGroupSessions } from "@/hooks/useGroupSessions";
import { usePractitionerAppointments, useMutateAppointment } from "@/hooks/useAppointments";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import { COACH_REVENUE_RATE } from "@/lib/session-validation";

// Lazy load tabs
const SessionsTab = lazy(() => import("@/components/dashboard/coach/tabs/SessionsTab"));
const AppointmentsTab = lazy(() => import("@/components/dashboard/coach/tabs/AppointmentsTab"));
const AvailabilityTab = lazy(() => import("@/components/dashboard/coach/tabs/AvailabilityTab"));
const ProfileTab = lazy(() => import("@/components/dashboard/coach/tabs/ProfileTab"));
const NotificationsTab = lazy(() => import("@/components/dashboard/coach/tabs/NotificationsTab"));
const SupportTab = lazy(() => import("@/components/dashboard/coach/tabs/SupportTab"));
const CoachPayoutsSection = lazy(() => import("@/components/dashboard/coach/CoachPayoutsSection"));
const PaymentInfoSection = lazy(() => import("@/components/dashboard/practitioner/PaymentInfoSection").then(m => ({ default: m.PaymentInfoSection })));

export default function CoachDashboard() {
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Fetch coach profile
  const { data: coach, isLoading: isLoadingCoach } = useQuery({
    queryKey: ['coach-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('user_id', user.id)
        .eq('practitioner_type', 'coach_sportif')
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const {
    sessions,
    count: sessionsCount,
    isLoading: isLoadingSessions,
    cancelSessionAsync,
    isCancelling,
    confirmSessionAsync,
    isConfirming
  } = useGroupSessions(coach?.id, 0, 100);

  // Fetch individual appointments for coach
  const {
    data: appointmentsResult,
    isLoading: isLoadingAppointments,
  } = usePractitionerAppointments(coach?.id, 0, 100);
  
  const appointments = appointmentsResult?.data || [];

  const mutateAppointment = useMutateAppointment();
  const [processingAppointment, setProcessingAppointment] = useState<string | null>(null);
  const [sessionsLimit, setSessionsLimit] = useState(10);

  // Memoize stats calculations
  const stats = useMemo(() => {
    const now = new Date();
    
    return {
      upcomingSessions: sessions?.filter(s => {
        const sessionDate = new Date(s.scheduled_date);
        return (s.status === 'planifiee' || s.status === 'confirmee') && sessionDate >= now;
      }).length || 0,
      upcomingAppointments: appointments?.filter(a => 
        a.status === 'confirmed' || a.status === 'pending' || a.status === 'awaiting_practitioner'
      ).length || 0,
      totalParticipants: sessions?.reduce((sum, s) => 
        sum + (s.current_participants || 0), 0
      ) || 0,
      // 95% pour le coach (5% commission plateforme)
      totalRevenue: sessions?.filter(s => s.status === 'terminee')
        .reduce((sum, s) => sum + (s.price_per_person * (s.current_participants || 0) * COACH_REVENUE_RATE), 0) || 0,
      appointmentsRevenue: appointments?.filter(a => a.status === 'completed')
        .reduce((sum, a) => sum + ((a.paymentAmount || 0) * COACH_REVENUE_RATE), 0) || 0,
    };
  }, [sessions, appointments]);

  const handleCancelSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setCancelDialogOpen(true);
  };

  const handleConfirmCancelSession = async () => {
    if (!selectedSessionId) return;

    try {
      await cancelSessionAsync(selectedSessionId);
      setCancelDialogOpen(false);
      setSelectedSessionId(null);
    } catch (error) {
      // L'erreur est déjà gérée par le hook (toast affiché)
      // On garde le dialog ouvert pour permettre de réessayer
      console.error('Erreur annulation séance:', error);
    }
  };

  const handleConfirmSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setConfirmDialogOpen(true);
  };

  const handleConfirmConfirmSession = async () => {
    if (!selectedSessionId) return;

    try {
      await confirmSessionAsync(selectedSessionId);
      setConfirmDialogOpen(false);
      setSelectedSessionId(null);
    } catch (error) {
      // L'erreur est déjà gérée par le hook (toast affiché)
      // On garde le dialog ouvert pour permettre de réessayer
      console.error('Erreur confirmation séance:', error);
    }
  };

  const handleAcceptAppointment = async (appointmentId: string) => {
    if (processingAppointment === appointmentId) return;
    
    setProcessingAppointment(appointmentId);
    try {
      const { error, data } = await invokeEdgeFunctionWithRetry('handle-appointment-response', {
        body: { appointmentId, action: 'accept' }
      });

      if (error) {
        if (error.message?.includes('déjà été traité')) {
          toast({
            title: 'Rendez-vous déjà traité',
            description: 'Ce rendez-vous a déjà été accepté ou refusé.',
          });
          return;
        }
        throw error;
      }

      // L'edge function met déjà à jour le statut à 'pending_payment'
      // Invalider les queries pour rafraîchir les données
      await queryClient.invalidateQueries({ queryKey: ['appointments', 'practitioner', coach?.id] });

      toast({
        title: 'Rendez-vous accepté',
        description: 'Le patient a été notifié et peut maintenant procéder au paiement.'
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error:', error);
      }
      toast({
        title: 'Erreur',
        description: 'Impossible d\'accepter le rendez-vous.',
        variant: 'destructive'
      });
    } finally {
      setProcessingAppointment(null);
    }
  };

  const handleRejectAppointment = async (appointmentId: string) => {
    if (processingAppointment === appointmentId) return;
    
    setProcessingAppointment(appointmentId);
    try {
      const { error } = await invokeEdgeFunctionWithRetry('handle-appointment-response', {
        body: { appointmentId, action: 'reject' }
      });

      if (error) {
        if (error.message?.includes('déjà été traité')) {
          toast({
            title: 'Rendez-vous déjà traité',
            description: 'Ce rendez-vous a déjà été accepté ou refusé.',
          });
          return;
        }
        throw error;
      }

      await mutateAppointment.mutateAsync({
        id: appointmentId,
        data: { status: 'rejected' }
      });

      toast({
        title: 'Rendez-vous refusé',
        description: 'Le patient a été notifié.'
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error:', error);
      }
      toast({
        title: 'Erreur',
        description: 'Impossible de refuser le rendez-vous.',
        variant: 'destructive'
      });
    } finally {
      setProcessingAppointment(null);
    }
  };

  if (isLoadingUser || isLoadingCoach) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10">
        <Header />
        <main className="pt-24 pb-12">
          <div className="container mx-auto px-4">
            <Card className="max-w-md mx-auto">
              <CardHeader>
                <CardTitle>Profil non trouvé</CardTitle>
                <CardDescription>
                  Votre profil de coach sportif n'a pas été trouvé.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate('/')}>
                  Retour à l'accueil
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10">
      <Header />
      
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">
              Bienvenue, Coach {coach.name} 👋
            </h1>
            <p className="text-muted-foreground">
              Gérez vos séances de coaching et suivez vos statistiques
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="shadow-medical">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Séances à venir
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-3xl font-bold">{stats.upcomingSessions + stats.upcomingAppointments}</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.upcomingSessions} séances + {stats.upcomingAppointments} RDV
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-medical">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Participants totaux
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{stats.totalParticipants}</span>
                  <Users className="h-8 w-8 text-secondary" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-medical">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenus (net, 100 derniers)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    {Math.round(stats.totalRevenue + stats.appointmentsRevenue) > 0 ? (
                      <>
                        <span className="text-3xl font-bold">{Math.round(stats.totalRevenue + stats.appointmentsRevenue).toLocaleString()} FCFA</span>
                        <p className="text-xs text-muted-foreground mt-1">
                          Séances + consultations
                        </p>
                      </>
                    ) : (
                      <span className="text-2xl text-muted-foreground">Aucun revenu</span>
                    )}
                  </div>
                  <DollarSign className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="sessions" className="space-y-6">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="sessions" className="gap-2">
                <Users className="h-4 w-4" />
                <span className="sm:hidden">Séan.</span>
                <span className="hidden sm:inline">Séances</span>
              </TabsTrigger>
              <TabsTrigger value="appointments" className="gap-2">
                <ClipboardList className="h-4 w-4" />
                <span className="sm:hidden">RDV</span>
                <span className="hidden sm:inline">Rendez-vous</span>
              </TabsTrigger>
              <TabsTrigger value="revenue" className="gap-2">
                <Wallet className="h-4 w-4" />
                <span className="sm:hidden">Rev.</span>
                <span className="hidden sm:inline">Revenus</span>
              </TabsTrigger>
              <TabsTrigger value="availability" className="gap-2">
                <Calendar className="h-4 w-4" />
                <span className="sm:hidden">Dispo</span>
                <span className="hidden sm:inline">Disponibilité</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-2">
                <User className="h-4 w-4" />
                <span className="sm:hidden">Prof.</span>
                <span className="hidden sm:inline">Profil</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="h-4 w-4" />
                <span className="sm:hidden">Not.</span>
                <span className="hidden sm:inline">Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="support" className="gap-2">
                <HelpCircle className="h-4 w-4" />
                <span className="sm:hidden">Aide</span>
                <span className="hidden sm:inline">Support</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sessions">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }>
                <SessionsTab 
                  coach={coach}
                  sessions={sessions}
                  isLoadingSessions={isLoadingSessions}
                  onCancelSession={handleCancelSession}
                  onConfirmSession={handleConfirmSession}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="appointments">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }>
                <AppointmentsTab
                  appointments={appointments}
                  isLoadingAppointments={isLoadingAppointments}
                  processingAppointment={processingAppointment}
                  onAcceptAppointment={handleAcceptAppointment}
                  onRejectAppointment={handleRejectAppointment}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="revenue">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }>
                <div className="space-y-6">
                  <PaymentInfoSection practitionerId={coach.id} practitionerName={coach.name} />
                  <CoachPayoutsSection coachId={coach.id} coachName={coach.name} />
                </div>
              </Suspense>
            </TabsContent>

            <TabsContent value="availability">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }>
                <AvailabilityTab practitionerId={coach.id} practitionerData={coach} />
              </Suspense>
            </TabsContent>

            <TabsContent value="profile">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }>
                <ProfileTab practitionerId={coach.id} practitionerData={coach} />
              </Suspense>
            </TabsContent>

            <TabsContent value="notifications">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }>
                <NotificationsTab />
              </Suspense>
            </TabsContent>

            <TabsContent value="support">
              <Suspense fallback={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              }>
                <SupportTab />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Cancel Session Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => !isCancelling && setCancelDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les participants seront notifiés de l'annulation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Non</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancelSession} disabled={isCancelling}>
              {isCancelling ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Annulation...</>
              ) : (
                "Oui, annuler"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Session Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={(open) => !isConfirming && setConfirmDialogOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les participants seront notifiés de la confirmation de la séance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirming}>Non</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmConfirmSession} disabled={isConfirming}>
              {isConfirming ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirmation...</>
              ) : (
                "Oui, confirmer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
