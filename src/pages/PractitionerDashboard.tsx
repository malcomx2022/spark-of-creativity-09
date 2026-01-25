import { useState, useMemo, lazy, Suspense } from 'react';
import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  Clock, 
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  DollarSign,
  FileText,
  Star,
  MessageSquare,
  HelpCircle,
  Shield,
  ClipboardCheck,
  Wallet
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useMutateAppointment, usePractitionerAppointments } from '@/hooks/useAppointments';
import { useNotifications } from '@/hooks/useNotifications';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunctionWithRetry } from '@/lib/edge-function-retry';
import { getKYCMessage, calculateMonthlyTotalMinutes } from '@/lib/practitionerHelpers';
import Header from '@/components/Header';

// Lazy load dashboard tabs
const ProfessionalProfileSection = lazy(() => import('@/components/dashboard/practitioner/ProfessionalProfileSection').then(m => ({ default: m.ProfessionalProfileSection })));
const AvailabilitySection = lazy(() => import('@/components/dashboard/practitioner/AvailabilitySection'));
const PayoutsSection = lazy(() => import('@/components/dashboard/practitioner/PayoutsSection'));
const PaymentInfoSection = lazy(() => import('@/components/dashboard/practitioner/PaymentInfoSection').then(m => ({ default: m.PaymentInfoSection })));
// CareNotesSection removed - using only ConsultationReportSection
const ReviewsSection = lazy(() => import('@/components/dashboard/practitioner/ReviewsSection'));
const NotificationsSection = lazy(() => import('@/components/dashboard/NotificationsSection').then(m => ({ default: m.NotificationsSection })));
const PractitionerMessagesSection = lazy(() => import('@/components/dashboard/practitioner/PractitionerMessagesSection').then(m => ({ default: m.PractitionerMessagesSection })));
const SupportSection = lazy(() => import('@/components/dashboard/SupportSection').then(m => ({ default: m.SupportSection })));
const ConsultationReportSection = lazy(() => import('@/components/dashboard/practitioner/ConsultationReportSection').then(m => ({ default: m.ConsultationReportSection })));
const LocationSection = lazy(() => import('@/components/dashboard/practitioner/LocationSection').then(m => ({ default: m.LocationSection })));
const DocumentsSection = lazy(() => import('@/components/dashboard/practitioner/DocumentsSection').then(m => ({ default: m.DocumentsSection })));

export default function PractitionerDashboard() {
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const { toast } = useToast();
  const [processingAppointment, setProcessingAppointment] = useState<string | null>(null);
  const [awaitingLimit, setAwaitingLimit] = useState(10);
  const [confirmedLimit, setConfirmedLimit] = useState(10);
  const [completedLimit, setCompletedLimit] = useState(10);
  const practitionerUserId = user?.id;
  
  // 🔔 Activer les notifications en temps réel
  useNotifications(practitionerUserId);
  const practitionerName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Praticien';

  // Récupérer les données du praticien
  const { data: practitioner, isLoading: practitionerLoading } = useQuery({
    queryKey: ["practitioner", practitionerUserId],
    queryFn: async () => {
      if (!practitionerUserId) return null;
      const { data, error } = await supabase
        .from("practitioners")
        .select("*")
        .eq("user_id", practitionerUserId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!practitionerUserId,
  });

  const practitionerId = practitioner?.id;

  const {
    data: appointmentsResult,
    isLoading: isLoadingAppointments,
    isError,
  } = usePractitionerAppointments(practitionerId, 0, 200);
  
  const appointments = appointmentsResult?.data || [];

  const mutateAppointment = useMutateAppointment();

  // ✅ CORRECTION P0-1: Vérifier les deux conditions KYC pour cohérence avec useAppointments
  const canProcessAppointments = practitioner?.can_accept_missions && practitioner?.kyc_status === 'approved';

  const handleAccept = async (appointmentId: string) => {
    if (processingAppointment === appointmentId) return;

    // Bloquer si le compte n'est pas validé (vérifier les deux conditions)
    if (!canProcessAppointments) {
      toast({
        title: 'Compte non activé',
        description: 'Votre compte doit être validé (KYC approuvé) avant d\'accepter des consultations.',
        variant: 'destructive'
      });
      return;
    }
    
    setProcessingAppointment(appointmentId);
    try {
      const { data, error } = await invokeEdgeFunctionWithRetry('handle-appointment-response', {
        body: { appointmentId, action: 'accept' }
      });

      if (error) {
        const errorMessage = error.message || '';

        // Si le rendez-vous a déjà été traité, afficher un message informatif au lieu d'une erreur
        if (errorMessage.includes('déjà été traité')) {
          toast({
            title: 'Rendez-vous déjà traité',
            description: 'Ce rendez-vous a déjà été accepté ou refusé.',
          });
          // ✅ CORRECTION P1-7: Invalider quand même pour rafraîchir l'état
          mutateAppointment.mutate({ id: appointmentId, data: {} });
          return;
        }

        throw error;
      }

      // ✅ CORRECTION P1-7: Vérifier le succès de l'edge function avant mise à jour locale
      if (!data?.success) {
        throw new Error(data?.error || 'La requête a échoué côté serveur');
      }

      // ✅ Invalider la query pour rafraîchir la liste des rendez-vous
      await mutateAppointment.mutateAsync({
        id: appointmentId,
        data: { status: 'pending_payment' } // Le vrai statut après acceptation est pending_payment
      });

      toast({
        title: 'Rendez-vous accepté',
        description: 'Le patient a été notifié et peut maintenant procéder au paiement.'
      });
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Appointment accept error:', error);
      }
      toast({
        title: 'Erreur',
        description: error?.message || 'Impossible d\'accepter le rendez-vous.',
        variant: 'destructive'
      });
    } finally {
      setProcessingAppointment(null);
    }
  };

  const handleReject = async (appointmentId: string) => {
    if (processingAppointment === appointmentId) return;

    // Bloquer si le compte n'est pas validé (vérifier les deux conditions)
    if (!canProcessAppointments) {
      toast({
        title: 'Compte non activé',
        description: 'Votre compte doit être validé (KYC approuvé) avant de refuser des consultations.',
        variant: 'destructive'
      });
      return;
    }
    
    setProcessingAppointment(appointmentId);
    try {
      const { data, error } = await invokeEdgeFunctionWithRetry('handle-appointment-response', {
        body: { appointmentId, action: 'reject' }
      });

      if (error) {
        const errorMessage = error.message || '';

        // Si le rendez-vous a déjà été traité, afficher un message informatif au lieu d'une erreur
        if (errorMessage.includes('déjà été traité')) {
          toast({
            title: 'Rendez-vous déjà traité',
            description: 'Ce rendez-vous a déjà été accepté ou refusé.',
          });
          // ✅ CORRECTION P1-7: Invalider quand même pour rafraîchir l'état
          mutateAppointment.mutate({ id: appointmentId, data: {} });
          return;
        }

        throw error;
      }

      // ✅ CORRECTION P1-7: Vérifier le succès de l'edge function avant mise à jour locale
      if (!data?.success) {
        throw new Error(data?.error || 'La requête a échoué côté serveur');
      }

      // ✅ Invalider la query pour rafraîchir la liste des rendez-vous
      // Le statut peut être 'rejected' ou 'awaiting_practitioner' si réassigné
      await mutateAppointment.mutateAsync({
        id: appointmentId,
        data: {} // Laisser le serveur définir le statut final
      });

      toast({
        title: 'Rendez-vous refusé',
        description: data?.practitioner
          ? `Le rendez-vous a été réassigné à ${data.practitioner.name}.`
          : 'Le système recherche un praticien alternatif pour le patient.'
      });
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Appointment reject error:', error);
      }
      toast({
        title: 'Erreur',
        description: error?.message || 'Impossible de refuser le rendez-vous.',
        variant: 'destructive'
      });
    } finally {
      setProcessingAppointment(null);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'completed' | 'cancelled') => {
    // ✅ CORRECTION P1-1: Vérifier practitioner ET practitionerId ensemble
    if (!practitioner || !practitionerId) {
      toast({
        title: 'Action impossible',
        description: 'Données du praticien non disponibles. Veuillez rafraîchir la page.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Si on annule le rendez-vous, annuler aussi le paiement en attente
      if (status === 'cancelled') {
        console.log('Vérification et annulation du paiement en attente pour:', id);
        
        // Appeler l'edge function pour annuler le paiement
        const { error: cancelError } = await supabase.functions.invoke('cancel-pending-payment', {
          body: { appointmentId: id }
        });

        if (cancelError) {
          // Log l'erreur mais ne pas bloquer l'annulation du rendez-vous
          console.warn('Erreur lors de l\'annulation du paiement:', cancelError);
        } else {
          console.log('Paiement en attente annulé avec succès');
        }
      }

      // Mettre à jour le statut du rendez-vous avec timestamp de fin si complété
      const updateData: Record<string, unknown> = {
        status,
        practitioner_id: practitionerId,
        practitioner_name: practitionerName,
      };

      // Enregistrer le timestamp de fin de consultation
      if (status === 'completed') {
        updateData.consultation_ended_at = new Date().toISOString();
      }

      await mutateAppointment.mutateAsync({
        id,
        data: updateData
      });

      const messages = {
        completed: {
          title: 'Consultation terminée',
          description: 'Le rendez-vous a été marqué comme terminé.'
        },
        cancelled: {
          title: '✅ Rendez-vous annulé',
          description: 'Le patient a été notifié. Le paiement en attente a été annulé si nécessaire.',
          variant: 'destructive' as const
        }
      } as const;

      toast(messages[status]);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Appointment status update error:', error);
      }
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le rendez-vous.',
        variant: 'destructive'
      });
    }
  };

  const categorizedAppointments = useMemo(() => ({
    awaiting: appointments.filter(apt => apt.status === 'awaiting_practitioner'),
    pending: appointments.filter(apt => apt.status === 'pending'),
    confirmed: appointments.filter(apt => apt.status === 'confirmed'),
    completed: appointments.filter(apt => apt.status === 'completed'),
  }), [appointments]);

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

        {/* Alerte pour les comptes non opérationnels */}
        {/* ✅ CORRECTION P0-1: Utiliser canProcessAppointments pour cohérence */}
        {!canProcessAppointments && (
          <Card className="mb-8 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <AlertCircle className="h-5 w-5" />
                ⚠️ Compte non opérationnel
              </CardTitle>
              <CardDescription className="text-orange-600 dark:text-orange-300">
                {getKYCMessage(practitioner.kyc_status, practitioner.kyc_comment)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-white/50 dark:bg-black/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-2">
                  🚫 Restrictions actuelles :
                </p>
                <ul className="list-disc list-inside text-sm text-orange-700 dark:text-orange-400 space-y-1">
                  <li>Vous ne pouvez pas accepter de nouvelles consultations</li>
                  <li>Vous ne pouvez pas refuser de consultations</li>
                  <li>Vous pouvez consulter votre dashboard et compléter votre profil</li>
                </ul>
              </div>
              {practitioner.kyc_status === 'pending' && (
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    📋 Documents en cours de vérification :
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
                    <li>Pièce d'identité</li>
                    <li>Licence d'exercice</li>
                    <li>Diplômes et certifications</li>
                  </ul>
                </div>
              )}
              {practitioner.kyc_status === 'incomplete' && (
                <p className="text-sm text-muted-foreground mt-4">
                  Veuillez compléter votre dossier dans l'onglet "Profil" ou contactez le support : support@domicares.life
                </p>
              )}
              {practitioner.kyc_status === 'rejected' && (
                <p className="text-sm text-muted-foreground mt-4">
                  Veuillez contacter le support pour plus d'informations : support@domicares.life
                </p>
              )}
            </CardContent>
          </Card>
        )}


        {/* Cartes de résumé */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">À traiter</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categorizedAppointments.awaiting.length}</div>
              <p className="text-xs text-muted-foreground">Demandes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Confirmés</CardTitle>
              <Calendar className="h-4 w-4 text-green-500 flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categorizedAppointments.confirmed.length}</div>
              <p className="text-xs text-muted-foreground">À venir</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Terminés</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{categorizedAppointments.completed.length}</div>
              <p className="text-xs text-muted-foreground">Ce mois</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Temps total</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {calculateMonthlyTotalMinutes(appointments)} min
              </div>
              <p className="text-xs text-muted-foreground">Ce mois</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="appointments" className="space-y-6">
          <div className="border-b">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              <TabsList className="inline-flex h-auto w-full min-w-max justify-start bg-transparent p-0 gap-0">
                <TabsTrigger value="appointments" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">RDV</span>
                </TabsTrigger>
                <TabsTrigger value="profile" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <User className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Profil</span>
                </TabsTrigger>
                <TabsTrigger value="availability" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm hidden sm:inline">Disponibilités</span>
                  <span className="text-sm sm:hidden">Dispo</span>
                </TabsTrigger>
                <TabsTrigger value="payment-info" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <Wallet className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm hidden md:inline">Coordonnées</span>
                  <span className="text-sm md:hidden">Pay</span>
                </TabsTrigger>
                <TabsTrigger value="payouts" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <DollarSign className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Revenus</span>
                </TabsTrigger>
                <TabsTrigger value="reports" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <ClipboardCheck className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Rapports</span>
                </TabsTrigger>
                <TabsTrigger value="messages" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Messages</span>
                </TabsTrigger>
                <TabsTrigger value="reviews" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <Star className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Avis</span>
                </TabsTrigger>
                <TabsTrigger value="support" className="flex items-center gap-1.5 px-3 py-2.5 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
                  <HelpCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Support</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="appointments" className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Mes consultations</h2>
              <CardDescription>Confirmez, terminez ou annulez vos rendez-vous en un clic.</CardDescription>
            </div>

            <Tabs defaultValue="awaiting">
              <TabsList>
                <TabsTrigger value="awaiting">
                  À traiter ({categorizedAppointments.awaiting.length})
                </TabsTrigger>
                <TabsTrigger value="confirmed">
                  Confirmés ({categorizedAppointments.confirmed.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Terminés ({categorizedAppointments.completed.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="awaiting" className="space-y-4 mt-4">
                {categorizedAppointments.awaiting.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Aucune demande en attente</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {categorizedAppointments.awaiting.slice(0, awaitingLimit).map(appointment => (
                      <div key={appointment.id} className="relative">
                        {processingAppointment === appointment.id && (
                          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Traitement en cours...</span>
                            </div>
                          </div>
                        )}
                        <AppointmentCard
                          appointment={appointment}
                          userRole="practitioner"
                          onConfirm={() => handleAccept(appointment.id)}
                          onReject={() => handleReject(appointment.id)}
                          disabled={!canProcessAppointments}
                        />
                      </div>
                    ))}
                    {categorizedAppointments.awaiting.length > awaitingLimit && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setAwaitingLimit(prev => prev + 10)}
                      >
                        Voir plus ({categorizedAppointments.awaiting.length - awaitingLimit} demandes restantes)
                      </Button>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="confirmed" className="space-y-4 mt-4">
                {categorizedAppointments.confirmed.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Aucun rendez-vous confirmé</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {categorizedAppointments.confirmed.slice(0, confirmedLimit).map(appointment => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        userRole="practitioner"
                        onComplete={() => handleStatusUpdate(appointment.id, 'completed')}
                        onCancel={() => handleStatusUpdate(appointment.id, 'cancelled')}
                      />
                    ))}
                    {categorizedAppointments.confirmed.length > confirmedLimit && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setConfirmedLimit(prev => prev + 10)}
                      >
                        Voir plus ({categorizedAppointments.confirmed.length - confirmedLimit} rendez-vous restants)
                      </Button>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="completed" className="space-y-4 mt-4">
                {categorizedAppointments.completed.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Aucune consultation terminée</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {categorizedAppointments.completed.slice(0, completedLimit).map(appointment => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        userRole="practitioner"
                      />
                    ))}
                    {categorizedAppointments.completed.length > completedLimit && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setCompletedLimit(prev => prev + 10)}
                      >
                        Voir plus ({categorizedAppointments.completed.length - completedLimit} consultations restantes)
                      </Button>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="profile">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <div className="space-y-6">
                <ProfessionalProfileSection
                  practitionerId={practitioner.id}
                  practitionerData={practitioner}
                />
                <LocationSection
                  practitionerId={practitioner.id}
                  practitionerData={practitioner}
                />
                <DocumentsSection practitionerData={practitioner} />
              </div>
            </Suspense>
          </TabsContent>

          <TabsContent value="availability">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <AvailabilitySection
                practitionerId={practitioner.id}
                practitionerData={practitioner}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="payment-info">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <PaymentInfoSection
                practitionerId={practitioner.id}
                practitionerName={practitioner.name}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <PayoutsSection practitionerId={practitioner.id} />
            </Suspense>
          </TabsContent>


          <TabsContent value="reports">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <ConsultationReportSection practitionerId={practitionerId || ''} />
            </Suspense>
          </TabsContent>

          <TabsContent value="reviews">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <ReviewsSection practitionerId={practitioner.id} />
            </Suspense>
          </TabsContent>

          <TabsContent value="messages">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <PractitionerMessagesSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="notifications">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <NotificationsSection />
            </Suspense>
          </TabsContent>

          <TabsContent value="support">
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
              <SupportSection />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
