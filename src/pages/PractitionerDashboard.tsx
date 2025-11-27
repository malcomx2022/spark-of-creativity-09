import { useState, useEffect } from 'react';
import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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
  Shield,
  ClipboardCheck,
  Wallet,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useMutateAppointment, usePractitionerAppointments } from '@/hooks/useAppointments';
import { useNotifications } from '@/hooks/useNotifications';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { invokeEdgeFunctionWithRetry } from '@/lib/edge-function-retry';
import Header from '@/components/Header';
import { ProfessionalProfileSection } from '@/components/dashboard/practitioner/ProfessionalProfileSection';
import AvailabilitySection from '@/components/dashboard/practitioner/AvailabilitySection';
import PayoutsSection from '@/components/dashboard/practitioner/PayoutsSection';
import { PaymentInfoSection } from '@/components/dashboard/practitioner/PaymentInfoSection';
import CareNotesSection from '@/components/dashboard/practitioner/CareNotesSection';
import ReviewsSection from '@/components/dashboard/practitioner/ReviewsSection';
import { NotificationsSection } from '@/components/dashboard/NotificationsSection';
import { PractitionerMessagesSection } from '@/components/dashboard/practitioner/PractitionerMessagesSection';
import { SupportSection } from '@/components/dashboard/SupportSection';
import { ConsultationReportSection } from '@/components/dashboard/practitioner/ConsultationReportSection';
import { LocationSection } from '@/components/dashboard/practitioner/LocationSection';
import { DocumentsSection } from '@/components/dashboard/practitioner/DocumentsSection';

export default function PractitionerDashboard() {
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [processingAppointment, setProcessingAppointment] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const practitionerUserId = user?.id;

  // 🔔 Activer les notifications en temps réel
  useNotifications(practitionerUserId);
  const practitionerName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    'Praticien';

  // Récupérer les données du praticien avec retry automatique
  const { data: practitioner, isLoading: practitionerLoading, refetch } = useQuery({
    queryKey: ["practitioner", practitionerUserId],
    queryFn: async () => {
      if (!practitionerUserId) return null;

      console.log('🔄 Récupération du profil praticien...');
      const { data, error } = await supabase
        .from("practitioners")
        .select("*")
        .eq("user_id", practitionerUserId)
        .single();

      if (error) {
        console.error('❌ Erreur récupération praticien:', error);
        throw error;
      }

      console.log('✅ Profil praticien récupéré avec succès');
      return data;
    },
    enabled: !!practitionerUserId,
    retry: 3, // Retry automatique 3 fois
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Backoff exponentiel: 1s, 2s, 4s
  });

  // Retry automatique si praticien non trouvé (pour les nouveaux inscrits)
  useEffect(() => {
    if (!practitioner && !practitionerLoading && practitionerUserId && retryCount < 3) {
      console.log(`⏳ Retry automatique ${retryCount + 1}/3 après 1.5s...`);

      const timer = setTimeout(() => {
        console.log('🔄 Retry manuel...');
        refetch();
        setRetryCount(prev => prev + 1);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [practitioner, practitionerLoading, retryCount, refetch, practitionerUserId]);

  const practitionerId = practitioner?.id;

  const {
    data: appointments = [],
    isLoading: isLoadingAppointments,
    isError,
  } = usePractitionerAppointments(practitionerId);

  const mutateAppointment = useMutateAppointment();

  const handleAccept = async (appointmentId: string) => {
    if (processingAppointment === appointmentId) return;
    
    // Bloquer si le compte n'est pas validé
    if (!practitioner?.can_accept_missions) {
      toast({
        title: 'Compte non activé',
        description: 'Votre compte doit être validé avant d\'accepter des consultations.',
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
          return;
        }
        
        throw error;
      }

      // ✅ Invalider la query pour rafraîchir la liste des rendez-vous
      await mutateAppointment.mutateAsync({
        id: appointmentId,
        data: { status: 'confirmed' }
      });

      toast({
        title: 'Rendez-vous accepté',
        description: 'Le patient a été notifié et peut maintenant procéder au paiement.'
      });
    } catch (error) {
      console.error('Erreur lors de l\'acceptation', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'accepter le rendez-vous.',
        variant: 'destructive'
      });
    } finally {
      setProcessingAppointment(null);
    }
  };

  const handleReject = async (appointmentId: string) => {
    if (processingAppointment === appointmentId) return;
    
    // Bloquer si le compte n'est pas validé
    if (!practitioner?.can_accept_missions) {
      toast({
        title: 'Compte non activé',
        description: 'Votre compte doit être validé avant de refuser des consultations.',
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
          return;
        }
        
        throw error;
      }

      // ✅ Invalider la query pour rafraîchir la liste des rendez-vous
      await mutateAppointment.mutateAsync({
        id: appointmentId,
        data: { status: 'rejected' }
      });

      toast({
        title: 'Rendez-vous refusé',
        description: 'Le système recherche un praticien alternatif pour le patient.'
      });
    } catch (error) {
      console.error('Erreur lors du refus', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de refuser le rendez-vous.',
        variant: 'destructive'
      });
    } finally {
      setProcessingAppointment(null);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'completed' | 'cancelled') => {
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

  const awaitingAppointments = appointments.filter(apt => apt.status === 'awaiting_practitioner');
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
        <Header />
        <div className="container mx-auto max-w-2xl mt-20">
          <Card className="border-2">
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-orange-100 dark:bg-orange-900/20 p-4">
                  {retryCount < 3 ? (
                    <Loader2 className="w-12 h-12 text-orange-600 dark:text-orange-400 animate-spin" />
                  ) : (
                    <AlertCircle className="w-12 h-12 text-orange-600 dark:text-orange-400" />
                  )}
                </div>
              </div>

              <CardTitle className="text-2xl">
                {retryCount < 3 ? 'Chargement du profil...' : 'Profil praticien introuvable'}
              </CardTitle>

              <CardDescription className="text-base">
                {retryCount < 3 ? (
                  <>
                    Synchronisation de votre profil en cours. Veuillez patienter...
                    <br />
                    <span className="text-xs text-muted-foreground mt-2 block">
                      Tentative {retryCount + 1} sur 3
                    </span>
                  </>
                ) : (
                  'Impossible de charger votre profil praticien. Si vous venez de vous inscrire, veuillez vous reconnecter.'
                )}
              </CardDescription>
            </CardHeader>

            {retryCount >= 3 && (
              <CardContent className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold text-sm">Que faire ?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• Si vous venez de vous inscrire, reconnectez-vous</li>
                    <li>• Vérifiez votre connexion internet</li>
                    <li>• Contactez le support si le problème persiste</li>
                  </ul>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setRetryCount(0);
                      refetch();
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Réessayer
                  </Button>

                  <Button
                    className="flex-1"
                    onClick={() => navigate('/login')}
                  >
                    Se reconnecter
                  </Button>
                </div>
              </CardContent>
            )}
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
        {!practitioner.can_accept_missions && (
          <Card className="mb-8 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <AlertCircle className="h-5 w-5" />
                ⚠️ Compte non opérationnel
              </CardTitle>
              <CardDescription className="text-orange-600 dark:text-orange-300">
                {practitioner.kyc_status === 'pending' && (
                  <>
                    Votre dossier est en cours de vérification par notre équipe. Ce processus prend généralement 24 à 48 heures.
                    Vous recevrez un email et un SMS dès que votre compte sera activé.
                  </>
                )}
                {practitioner.kyc_status === 'incomplete' && (
                  <>
                    Des documents ou informations sont manquants dans votre dossier.
                    {practitioner.kyc_comment && ` Détails : ${practitioner.kyc_comment}`}
                  </>
                )}
                {practitioner.kyc_status === 'rejected' && (
                  <>
                    Votre dossier n'a pas été validé.
                    {practitioner.kyc_comment && ` Raison : ${practitioner.kyc_comment}`}
                  </>
                )}
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">À traiter</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{awaitingAppointments.length}</div>
              <p className="text-xs text-muted-foreground">Demandes</p>
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
          <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-auto min-w-full justify-start lg:grid lg:w-full lg:grid-cols-10 gap-1 sm:gap-2">
              <TabsTrigger value="appointments" className="gap-2 whitespace-nowrap">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">RDV</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-2 whitespace-nowrap">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Profil</span>
              </TabsTrigger>
              <TabsTrigger value="availability" className="gap-2 whitespace-nowrap">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Disponibilités</span>
              </TabsTrigger>
              <TabsTrigger value="payment-info" className="gap-2 whitespace-nowrap">
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">Coordonnées paiement</span>
              </TabsTrigger>
              <TabsTrigger value="payouts" className="gap-2 whitespace-nowrap">
                <DollarSign className="h-4 w-4" />
                <span className="hidden sm:inline">Revenus</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2 whitespace-nowrap">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Notes</span>
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-2 whitespace-nowrap">
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Rapports</span>
              </TabsTrigger>
              <TabsTrigger value="reviews" className="gap-2 whitespace-nowrap">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">Avis</span>
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-2 whitespace-nowrap">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Messages</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2 whitespace-nowrap">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="support" className="gap-2 whitespace-nowrap">
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Support</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Onglet Rendez-vous */}
          <TabsContent value="appointments" className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Mes consultations</h2>
              <CardDescription>Confirmez, terminez ou annulez vos rendez-vous en un clic.</CardDescription>
            </div>

            <Tabs defaultValue="awaiting">
              <TabsList>
                <TabsTrigger value="awaiting">
                  À traiter ({awaitingAppointments.length})
                </TabsTrigger>
                <TabsTrigger value="confirmed">
                  Confirmés ({confirmedAppointments.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Terminés ({completedAppointments.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="awaiting" className="space-y-4 mt-4">
                {awaitingAppointments.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Aucune demande en attente</p>
                    </CardContent>
                  </Card>
                ) : (
                  awaitingAppointments.map(appointment => (
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
                        disabled={!practitioner.can_accept_missions}
                      />
                    </div>
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
          </TabsContent>

          <TabsContent value="availability">
            <AvailabilitySection
              practitionerId={practitioner.id}
              practitionerData={practitioner}
            />
          </TabsContent>

          <TabsContent value="payment-info">
            <PaymentInfoSection
              practitionerId={practitioner.id}
              practitionerName={practitioner.name}
            />
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <PayoutsSection practitionerId={practitioner.id} />
          </TabsContent>

          <TabsContent value="notes">
            <CareNotesSection />
          </TabsContent>

          <TabsContent value="reports">
            <ConsultationReportSection />
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
