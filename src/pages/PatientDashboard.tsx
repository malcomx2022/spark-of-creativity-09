import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import Header from '@/components/Header';
import { AppointmentCard } from '@/components/AppointmentCard';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import GPSTracking from '@/components/GPSTracking';

// Lazy loaded tabs
const AppointmentsTab = lazy(() => import('@/components/dashboard/tabs/AppointmentsTab'));
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Calendar, Clock, FileText, User, Heart, CreditCard, Bell, MessageSquare, Star, HelpCircle, Shield, ClipboardCheck, AlertCircle, Users, ClipboardList } from 'lucide-react';
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
import { PatientGroupSessionsSection } from '@/components/dashboard/PatientGroupSessionsSection';
import { PatientCareNotesSection } from '@/components/dashboard/PatientCareNotesSection';
import { FedaPayWidget } from '@/components/FedaPayWidget';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { completePatientOnboardingFromMetadata } from '@/lib/patient-onboarding';
import { formatAmount } from '@/lib/payment-config';
import { getPersistedPaymentState, clearPersistedPaymentState } from '@/lib/payment-storage';

export default function PatientDashboard() {
  const [activeTab, setActiveTab] = useState("appointments");
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

  // ✅ Limiter à 100 derniers rendez-vous pour les performances
  const {
    data: appointmentsResult,
    isLoading: isLoadingAppointments,
    isError,
  } = usePatientAppointments(patientId, 0, 100);
  
  const appointments = appointmentsResult?.data || [];

  const createAppointment = useCreateAppointment(patientId, patientName);
  const mutateAppointment = useMutateAppointment();

  // ✅ Optimiser la requête payments pour charger uniquement les colonnes nécessaires
  const { data: payments } = useQuery({
    queryKey: ['payments', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('id, appointment_id, status, payout_status, amount, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(100); // ✅ Limiter à 100 derniers paiements
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
    staleTime: 30000, // ✅ Cache pendant 30 secondes
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
    
    // ✅ Nettoyer l'état de paiement persisté
    clearPersistedPaymentState();
    
    setPaymentDialogOpen(false);
    setAppointmentIdForPayment(null);
    setPaymentAmount(null);

    // Invalider et refetch toutes les queries liées
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.refetchQueries({ queryKey: ['appointments', 'patient', patientId] });
    queryClient.refetchQueries({ queryKey: ['payments', patientId] });
  }, [patientId, queryClient]);

  const handlePaymentDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      // Si un paiement est en cours, demander confirmation
      const persisted = getPersistedPaymentState();
      if (persisted && persisted.paymentStatus === 'pending') {
        const shouldKeep = window.confirm(
          'Voulez-vous finaliser ce paiement plus tard ?\n\n' +
          'Oui = Le paiement restera disponible\n' +
          'Non = Le paiement sera annulé'
        );

        if (!shouldKeep) {
          clearPersistedPaymentState();
        }
      }

      setAppointmentIdForPayment(null);
      setPaymentAmount(null);
    }
    setPaymentDialogOpen(open);
  }, []);

  const handlePaymentError = useCallback((error: Error) => {
    console.error('❌ Erreur de paiement:', error);
    toast({
      title: 'Erreur de paiement',
      description: error.message,
      variant: 'destructive',
    });
  }, []);

  const handleCancel = async (id: string) => {
    try {
      // 1. Vérifier et annuler le paiement en attente s'il existe
      const pendingPayment = payments?.find(p => 
        p.appointment_id === id && 
        (p.status === 'initiated' || p.status === 'pending')
      );

      if (pendingPayment) {
        console.log('Annulation du paiement en attente:', pendingPayment.id);
        
        // Annuler le paiement via l'edge function
        const { error: cancelError } = await supabase.functions.invoke('cancel-pending-payment', {
          body: { appointmentId: id }
        });

        if (cancelError) {
          console.warn('Erreur lors de l\'annulation du paiement:', cancelError);
          // Ne pas bloquer l'annulation du rendez-vous si le paiement échoue
        } else {
          console.log('Paiement annulé avec succès');
        }
      }

      // 2. Annuler le rendez-vous
      await mutateAppointment.mutateAsync({
        id,
        data: { status: 'cancelled' }
      });

      // 3. Nettoyer l'état de paiement persisté si c'était le rendez-vous en cours
      if (appointmentIdForPayment === id) {
        clearPersistedPaymentState();
        setPaymentDialogOpen(false);
        setAppointmentIdForPayment(null);
      }

      toast({
        title: '✅ Rendez-vous annulé',
        description: pendingPayment 
          ? 'Le rendez-vous et le paiement en attente ont été annulés.'
          : 'Le rendez-vous a été annulé avec succès.'
      });

      // Rafraîchir les données
      queryClient.invalidateQueries({ queryKey: ['payments', patientId] });
      
    } catch (error) {
      console.error('Erreur lors de l\'annulation du rendez-vous', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'annuler le rendez-vous.',
        variant: 'destructive'
      });
    }
  };

  // Rendez-vous en attente de paiement : status = 'pending_payment' OU (confirmed sans paiement réussi)
  const confirmedAwaitingPayment = appointments?.filter(apt => {
    // Si le statut est déjà pending_payment, c'est clair
    if (apt.status === 'pending_payment') return true;
    
    // Si le statut est confirmed, vérifier s'il y a déjà un paiement réussi
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Rendez-vous à venir</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingAppointments.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {appointments.filter(apt => apt.status === 'awaiting_practitioner' || apt.status === 'confirmed').length}
              </div>
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Consultations totales</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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

        {/* Grille de navigation sur desktop */}
        <div className="hidden lg:grid lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("appointments")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Rendez-vous</CardTitle>
              <Calendar className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Gérez vos consultations</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("group-sessions")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Séances de groupe</CardTitle>
              <Users className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Sessions collectives</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("triage")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Évaluation santé</CardTitle>
              <Shield className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Triage médical</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("reports")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Rapports</CardTitle>
              <ClipboardCheck className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Consultations détaillées</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("care-notes")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Notes SOAP</CardTitle>
              <ClipboardList className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Notes de soin</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("messages")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              <MessageSquare className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Conversations</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("profile")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Mon profil</CardTitle>
              <User className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Informations personnelles</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("medical")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Dossier médical</CardTitle>
              <Heart className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Historique de santé</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("payments")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Paiements</CardTitle>
              <CreditCard className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("notifications")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Notifications</CardTitle>
              <Bell className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Alertes et rappels</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("reviews")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Avis</CardTitle>
              <Star className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Évaluations</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary"
            onClick={() => setActiveTab("support")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Support</CardTitle>
              <HelpCircle className="h-5 w-5 text-primary flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Aide et contact</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="border-b lg:hidden">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              <TabsList className="inline-flex h-auto w-full min-w-max justify-start bg-transparent p-0 gap-0">
                <TabsTrigger 
                  value="appointments" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">RDV</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="group-sessions" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <Users className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm hidden xs:inline">Séances</span>
                  <span className="text-sm xs:hidden">Sessions</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="triage" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <Shield className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Triage</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="reports" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <ClipboardCheck className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Rapports</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="care-notes" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <ClipboardList className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm hidden sm:inline">Notes SOAP</span>
                  <span className="text-sm sm:hidden">Notes</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="profile" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <User className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Profil</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="medical" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <Heart className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm hidden sm:inline">Médical</span>
                  <span className="text-sm sm:hidden">Med</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="payments" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <CreditCard className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm hidden sm:inline">Paiements</span>
                  <span className="text-sm sm:hidden">Pay</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="messages" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Messages</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="notifications" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <Bell className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm hidden sm:inline">Notifications</span>
                  <span className="text-sm sm:hidden">Notif</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="reviews" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <Star className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Avis</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="support" 
                  className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent"
                >
                  <HelpCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Support</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>


          <TabsContent value="appointments" className="space-y-6">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <AppointmentsTab onPaymentRequired={handlePaymentRequired} />
            </Suspense>
          </TabsContent>

          <TabsContent value="group-sessions">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <PatientGroupSessionsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="triage">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <TriageForm />
            </Suspense>
          </TabsContent>

          <TabsContent value="reports">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <PatientConsultationReportsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="care-notes">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <PatientCareNotesSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="profile">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <ProfileSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="medical">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <MedicalSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="payments">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <PaymentsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="notifications">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <NotificationsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="messages">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <MessagesSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="reviews">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <ReviewsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="support">
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }>
              <SupportSection />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>

      {/* Payment Dialog - géré au niveau du dashboard */}
      {appointmentIdForPayment && paymentAmount !== null && (
        <FedaPayWidget
          open={paymentDialogOpen}
          onOpenChange={handlePaymentDialogOpenChange}
          appointmentId={appointmentIdForPayment}
          amount={paymentAmount}
          onSuccess={handlePaymentSuccess}
          onComplete={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}
    </div>
  );
}
