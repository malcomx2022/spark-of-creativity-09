import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import Header from '@/components/Header';
// ✅ CORRECTION P3-4: Suppression des imports inutilisés (AppointmentCard, NewAppointmentDialog, GPSTracking)

// Lazy loaded tabs
const AppointmentsTab = lazy(() => import('@/components/dashboard/tabs/AppointmentsTab'));
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Calendar, Clock, FileText, User, Heart, CreditCard, Bell, MessageSquare, Star, HelpCircle, Shield, ClipboardCheck, AlertCircle, Users, ClipboardList } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { useAuthUser, AUTH_USER_QUERY_KEY } from '@/hooks/useAuthUser';
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
// PatientCareNotesSection removed - using only PatientConsultationReportsSection
import { FedaPayWidget } from '@/components/FedaPayWidget';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, auth, errorMessage } from '@/lib/api';
import { completePatientOnboardingFromMetadata } from '@/lib/patient-onboarding';
import { formatAmount } from '@/lib/payment-config';
import { getPersistedPaymentState, clearPersistedPaymentState } from '@/lib/payment-storage';

/** Colonnes de `GET /payments` utilisées par le tableau de bord. */
interface PatientPaymentSummary {
  id: string;
  appointment_id: string;
  status: string;
  payout_status: string | null;
  amount: number;
  created_at: string;
}

/** Compteurs de `GET /stats/patient`. */
interface PatientStats {
  upcoming: number;
  past: number;
  completed: number;
  awaitingPayment: number;
  awaitingConfirmation: number;
}

export default function PatientDashboard() {
  const [activeTab, setActiveTab] = useState("appointments");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [appointmentIdForPayment, setAppointmentIdForPayment] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  // ✅ CORRECTION P2-3 & P2-4: États de chargement pour les actions
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const queryClient = useQueryClient();
  const { data: user, isLoading: isLoadingUser } = useAuthUser();
  const patientId = user?.id;
  const patientName =
    (user?.metadata?.full_name as string | undefined) ||
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

    // ✅ CORRECTION P3-1: Logs sans emojis pour cohérence
    if (elapsed > MAX_AGE) {
      console.log('[Payment] Paiement en attente expiré, abandon de la réhydratation');
      return;
    }

    console.log('[Payment] Réhydratation d\'un paiement en cours:', persisted.appointmentId);
    
    setAppointmentIdForPayment(persisted.appointmentId);
    setPaymentAmount(persisted.amount);
    setPaymentDialogOpen(true);

    // ✅ CORRECTION P2-2: Toast sans emoji pour cohérence
    toast({
      title: 'Paiement en attente',
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
      // ✅ Limiter à 100 derniers paiements (l'utilisateur est déduit du jeton)
      return api.get<PatientPaymentSummary[]>('/payments', { query: { limit: 100 } });
    },
    enabled: !!patientId,
    staleTime: 30000, // ✅ Cache pendant 30 secondes
  });

  // Compteurs du tableau de bord calculés côté API (repli sur les rendez-vous chargés)
  const { data: patientStats } = useQuery({
    queryKey: ['stats', 'patient', patientId],
    queryFn: () => api.get<PatientStats>('/stats/patient'),
    enabled: !!patientId,
    staleTime: 30000,
  });

  useEffect(() => {
    if (!user) return;

    // Ne pas tenter la synchronisation si déjà complété
    const metadata = user.metadata ?? {};
    if (metadata.patient_onboarding_completed || !metadata.pending_onboarding) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await completePatientOnboardingFromMetadata(user);
        if (!cancelled && result.completed) {
          toast({
            title: 'Profil patient mis à jour',
            description: 'Vos informations ont été synchronisées avec succès.',
          });
          queryClient.invalidateQueries({ queryKey: AUTH_USER_QUERY_KEY });
        }
      } catch (error) {
        console.error('Erreur lors de la finalisation du profil patient', error);
        // Ne pas afficher d'erreur si l'onboarding était déjà complété
        if (!cancelled && metadata.pending_onboarding) {
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

  // ✅ CORRECTION P3-1: Logs structurés sans emojis
  const handleNewAppointment = async (data: CreateAppointmentData) => {
    console.log('[Appointment] handleNewAppointment appelé avec:', data);
    console.log('[Appointment] Patient ID:', patientId);
    console.log('[Appointment] Patient Name:', patientName);

    try {
      console.log('[Appointment] Appel de createAppointment.mutateAsync...');
      const result = await createAppointment.mutateAsync(data);
      console.log('[Appointment] Rendez-vous créé:', result);
      toast({
        title: 'Rendez-vous créé',
        description: 'Votre rendez-vous a été créé. Veuillez procéder au paiement pour le confirmer.'
      });
      return result; // Retourner le rendez-vous créé avec son ID
    } catch (error) {
      console.error('[Appointment] Erreur lors de la création du rendez-vous:', error);
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Impossible de créer le rendez-vous pour le moment.',
        variant: 'destructive'
      });
      throw error; // Propager l'erreur pour arrêter le processus
    }
  };

  const handlePaymentRequired = async (appointmentId: string) => {
    // ✅ CORRECTION P2-4: Activer l'état de chargement
    setIsPreparingPayment(true);

    try {
      console.log('Ouverture du dialogue de paiement pour:', appointmentId);
      const appointment = appointments.find((apt) => apt.id === appointmentId);

      if (!appointment) {
        throw new Error('Rendez-vous introuvable');
      }

      // ✅ CORRECTION P1-3: Vérifier que le rendez-vous est dans un état valide pour le paiement
      const validStatusesForPayment = ['pending_payment', 'confirmed', 'awaiting_practitioner'];
      if (!validStatusesForPayment.includes(appointment.status)) {
        if (appointment.status === 'cancelled') {
          throw new Error('Ce rendez-vous a été annulé et ne peut plus être payé');
        }
        if (appointment.status === 'completed') {
          throw new Error('Ce rendez-vous est déjà terminé');
        }
        if (appointment.status === 'rejected') {
          throw new Error('Ce rendez-vous a été refusé par le praticien');
        }
        throw new Error(`Ce rendez-vous n'est pas éligible au paiement (statut: ${appointment.status})`);
      }

      // Vérifier si un paiement réussi existe déjà
      const existingSuccessfulPayment = payments?.find(p =>
        p.appointment_id === appointmentId &&
        (p.status === 'paid' || p.payout_status === 'paid' || p.payout_status === 'ready')
      );

      if (existingSuccessfulPayment) {
        throw new Error('Ce rendez-vous a déjà été payé');
      }

      let amount = appointment.paymentAmount ?? null;

      if (amount === null) {
        // Le montant est fixé par l'API lorsque le praticien accepte (tarif du praticien, service ou défaut)
        const refreshed = await api.get<{ payment_amount: number | null }>(`/appointments/${appointmentId}`);
        amount = refreshed.payment_amount ?? null;
      }

      // ✅ CORRECTION P0-3: Validation robuste du montant
      if (amount === null) {
        throw new Error('Impossible de déterminer le montant à payer pour ce rendez-vous');
      }

      // Vérifier que le montant est un nombre positif et dans les limites acceptables
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new Error('Le montant du paiement est invalide');
      }

      // Vérifier les limites de montant (entre 1000 et 1000000 XOF)
      const MIN_AMOUNT = 1000;
      const MAX_AMOUNT = 1000000;
      if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
        throw new Error(`Le montant doit être compris entre ${MIN_AMOUNT.toLocaleString()} et ${MAX_AMOUNT.toLocaleString()} XOF`);
      }

      setPaymentAmount(amount);
      setAppointmentIdForPayment(appointmentId);
      setPaymentDialogOpen(true);
    } catch (error) {
      console.error('Erreur lors de la préparation du paiement', error);
      // ✅ CORRECTION P2-2: Messages toast cohérents
      toast({
        title: 'Préparation du paiement impossible',
        description: error instanceof Error ? error.message : 'Veuillez réessayer ultérieurement.',
        variant: 'destructive',
      });
    } finally {
      // ✅ CORRECTION P2-4: Désactiver l'état de chargement
      setIsPreparingPayment(false);
    }
  };

  const handlePaymentSuccess = useCallback(async () => {
    console.log('[Payment] Paiement réussi - vérification de la persistance');

    // ✅ CORRECTION P0-1: Vérifier que le paiement est bien persisté en DB avant de fermer
    if (appointmentIdForPayment) {
      try {
        // Attendre un court instant pour laisser le webhook traiter le paiement
        await new Promise(resolve => setTimeout(resolve, 500));

        // Vérifier que le paiement existe avec un status valide
        const payment = (await api.get<PatientPaymentSummary[]>('/payments', { query: { appointmentId: appointmentIdForPayment, limit: 5 } }))
          .find((p) => ['paid', 'pending', 'initiated'].includes(p.status));

        if (!payment) {
          console.warn('[Payment] Paiement non trouvé en DB, état potentiellement incohérent');
        } else {
          console.log('[Payment] Paiement vérifié en DB:', payment.id, 'Status:', payment.status);
        }
      } catch (verifyError) {
        console.error('Erreur lors de la vérification du paiement:', verifyError);
      }
    }

    // Nettoyer l'état de paiement persisté
    clearPersistedPaymentState();

    setPaymentDialogOpen(false);
    setAppointmentIdForPayment(null);
    setPaymentAmount(null);

    // Invalider et refetch toutes les queries liées
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.refetchQueries({ queryKey: ['appointments', 'patient', patientId] });
    queryClient.refetchQueries({ queryKey: ['payments', patientId] });
  }, [patientId, queryClient, appointmentIdForPayment]);

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
          // ✅ CORRECTION P1-2: Nettoyer l'état local seulement si l'utilisateur choisit de ne pas garder
          setAppointmentIdForPayment(null);
          setPaymentAmount(null);
        }
        // Si shouldKeep=true, on garde l'état local pour permettre la reprise
      } else {
        // Pas de paiement en cours, nettoyer normalement
        setAppointmentIdForPayment(null);
        setPaymentAmount(null);
      }
    }
    setPaymentDialogOpen(open);
  }, []);

  const handlePaymentError = useCallback((error: Error) => {
    console.error('[Payment] Erreur de paiement:', error);
    toast({
      title: 'Erreur de paiement',
      description: error.message,
      variant: 'destructive',
    });
  }, []);

  const handleCancel = async (id: string) => {
    // ✅ CORRECTION P2-5: Demander confirmation avant annulation
    const confirmCancel = window.confirm(
      'Êtes-vous sûr de vouloir annuler ce rendez-vous ?\n\nCette action est irréversible.'
    );
    if (!confirmCancel) {
      return;
    }

    // ✅ CORRECTION P2-3: Activer l'état de chargement
    setIsCancelling(id);

    try {
      // ✅ CORRECTION P1-1: session requise (l'API vérifie que le rendez-vous appartient au patient)
      const currentUser = auth.getUser();
      if (!currentUser) {
        toast({
          title: 'Session expirée',
          description: 'Veuillez vous reconnecter pour continuer.',
          variant: 'destructive'
        });
        return;
      }

      const appointment = appointments.find((apt) => apt.id === id);

      // Vérifier que le rendez-vous peut être annulé (pas déjà annulé ou complété)
      if (appointment?.status === 'cancelled') {
        toast({
          title: 'Déjà annulé',
          description: 'Ce rendez-vous a déjà été annulé.',
          variant: 'default'
        });
        return;
      }

      if (appointment?.status === 'completed') {
        toast({
          title: 'Impossible d\'annuler',
          description: 'Vous ne pouvez pas annuler un rendez-vous terminé.',
          variant: 'destructive'
        });
        return;
      }

      // Paiement en attente éventuel (annulé par l'API en même temps que le rendez-vous)
      const pendingPayment = payments?.find(p =>
        p.appointment_id === id &&
        (p.status === 'initiated' || p.status === 'pending')
      );

      // Annuler le rendez-vous (POST /appointments/:id/cancel)
      await mutateAppointment.mutateAsync({ id, action: 'cancel' });

      // 3. Nettoyer l'état de paiement persisté si c'était le rendez-vous en cours
      if (appointmentIdForPayment === id) {
        clearPersistedPaymentState();
        setPaymentDialogOpen(false);
        setAppointmentIdForPayment(null);
      }

      // ✅ CORRECTION P2-2: Messages toast cohérents (sans emojis)
      toast({
        title: 'Rendez-vous annulé',
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
        description: errorMessage(error, 'Impossible d\'annuler le rendez-vous.'),
        variant: 'destructive'
      });
    } finally {
      // ✅ CORRECTION P2-3: Désactiver l'état de chargement
      setIsCancelling(null);
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
  const upcomingCount = patientStats?.upcoming ?? upcomingAppointments.length;

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

        {/* ✅ CORRECTION P2-1: Bouton retry en cas d'erreur de chargement */}
        {!isLoading && isError && (
          <Card className="mb-6">
            <CardContent className="flex flex-col sm:flex-row items-center gap-4 py-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>Une erreur est survenue lors du chargement de vos rendez-vous.</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', patientId] });
                  queryClient.invalidateQueries({ queryKey: ['payments', patientId] });
                }}
              >
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Mon espace patient</h1>
          <p className="text-muted-foreground">Gérez vos rendez-vous et consultations</p>
        </div>

        {/* ✅ CORRECTION P3-2: Stats cards avec messages plus informatifs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Rendez-vous à venir</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {upcomingCount === 0
                  ? 'Aucun rendez-vous planifié'
                  : upcomingCount === 1
                  ? 'Prochain rendez-vous planifié'
                  : 'Rendez-vous planifiés'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent>
              {(() => {
                const pendingCount = appointments.filter(apt => apt.status === 'awaiting_practitioner' || apt.status === 'confirmed').length;
                return (
                  <>
                    <div className="text-2xl font-bold">{pendingCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pendingCount === 0
                        ? 'Aucune confirmation en attente'
                        : pendingCount === 1
                        ? 'En attente de confirmation'
                        : 'En attente de confirmation'}
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Consultations totales</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent>
              {(() => {
                const completedCount = patientStats?.completed ?? appointments.filter(apt => apt.status === 'completed').length;
                return (
                  <>
                    <div className="text-2xl font-bold">{completedCount}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {completedCount === 0
                        ? 'Aucune consultation effectuée'
                        : completedCount === 1
                        ? 'Consultation terminée'
                        : 'Consultations terminées'}
                    </p>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>
        {/* La bannière de paiement en attente est affichée dans AppointmentsTab pour éviter la duplication */}

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Mes rendez-vous</h2>
          {/* Bouton supprimé ici - il est déjà dans AppointmentsTab */}
        </div>

        {/* ✅ CORRECTION P2-8: Grille de navigation sur desktop avec aria-labels */}
        <nav className="hidden lg:grid lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8" aria-label="Navigation principale">
          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder aux rendez-vous"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("appointments")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("appointments")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Rendez-vous</CardTitle>
              <Calendar className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Gérez vos consultations</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder aux séances de groupe"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("group-sessions")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("group-sessions")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Séances de groupe</CardTitle>
              <Users className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Sessions collectives</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder à l'évaluation santé"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("triage")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("triage")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Évaluation santé</CardTitle>
              <Shield className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Triage médical</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder aux rapports de consultation"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("reports")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("reports")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Rapports</CardTitle>
              <ClipboardCheck className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Consultations détaillées</p>
            </CardContent>
          </Card>


          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder aux messages"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("messages")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("messages")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              <MessageSquare className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Conversations</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder au profil"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("profile")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("profile")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Mon profil</CardTitle>
              <User className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Informations personnelles</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder au dossier médical"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("medical")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("medical")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Dossier médical</CardTitle>
              <Heart className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Historique de santé</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder aux paiements"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("payments")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("payments")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Paiements</CardTitle>
              <CreditCard className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder aux notifications"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("notifications")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("notifications")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Notifications</CardTitle>
              <Bell className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Alertes et rappels</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder aux avis"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("reviews")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("reviews")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Avis</CardTitle>
              <Star className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Évaluations</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            aria-label="Accéder au support"
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            onClick={() => setActiveTab("support")}
            onKeyDown={(e) => e.key === 'Enter' && setActiveTab("support")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Support</CardTitle>
              <HelpCircle className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Aide et contact</p>
            </CardContent>
          </Card>
        </nav>

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


          {/* ✅ CORRECTION P3-5: Fallbacks Suspense plus informatifs */}
          <TabsContent value="appointments" className="space-y-6">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement des rendez-vous...</span>
              </div>
            }>
              <AppointmentsTab onPaymentRequired={handlePaymentRequired} />
            </Suspense>
          </TabsContent>

          <TabsContent value="group-sessions">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement des séances de groupe...</span>
              </div>
            }>
              <PatientGroupSessionsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="triage">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement du formulaire de triage...</span>
              </div>
            }>
              <TriageForm />
            </Suspense>
          </TabsContent>

          <TabsContent value="reports">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement des rapports...</span>
              </div>
            }>
              <PatientConsultationReportsSection />
            </Suspense>
          </TabsContent>


          <TabsContent value="profile">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement du profil...</span>
              </div>
            }>
              <ProfileSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="medical">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement du dossier médical...</span>
              </div>
            }>
              <MedicalSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="payments">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement des paiements...</span>
              </div>
            }>
              <PaymentsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="notifications">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement des notifications...</span>
              </div>
            }>
              <NotificationsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="messages">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement des messages...</span>
              </div>
            }>
              <MessagesSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="reviews">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement des avis...</span>
              </div>
            }>
              <ReviewsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="support">
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement du support...</span>
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
