import { useEffect, useState } from 'react';
import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import GPSTracking from '@/components/GPSTracking';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePatientAppointments, useMutateAppointment, useCreateAppointment } from '@/hooks/useAppointments';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, Calendar, Clock, CreditCard, FileText, RefreshCw, XCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAmount } from '@/lib/payment-config';
import { getPersistedPaymentState, clearPersistedPaymentState, PersistedPaymentState } from '@/lib/payment-storage';

interface AppointmentsTabProps {
  onPaymentRequired: (appointmentId: string) => void;
}

export default function AppointmentsTab({ onPaymentRequired }: AppointmentsTabProps) {
  const { data: user } = useSupabaseUser();
  const patientId = user?.id;
  const patientName = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Patient';
  const queryClient = useQueryClient();

  const [orphanedPayment, setOrphanedPayment] = useState<PersistedPaymentState | null>(null);
  const [isRecoveringPayment, setIsRecoveringPayment] = useState(false);

  const { data: appointmentsResult, isLoading } = usePatientAppointments(patientId, 0, 100);
  const appointments = appointmentsResult?.data || [];
  const mutateAppointment = useMutateAppointment();
  const createAppointment = useCreateAppointment(patientId, patientName);

  // Vérifier les paiements orphelins au chargement
  useEffect(() => {
    const checkOrphanedPayment = async () => {
      const persistedPayment = getPersistedPaymentState();

      if (!persistedPayment) {
        setOrphanedPayment(null);
        return;
      }

      // Vérifier si le paiement est ancien (> 30 minutes = probablement expiré)
      const MAX_AGE_MS = 30 * 60 * 1000;
      if (Date.now() - persistedPayment.lastUpdated > MAX_AGE_MS) {
        console.log('[OrphanedPayment] Payment state too old, clearing');
        clearPersistedPaymentState();
        setOrphanedPayment(null);
        return;
      }

      // Vérifier si le paiement était en cours
      if (persistedPayment.paymentStatus !== 'pending') {
        clearPersistedPaymentState();
        setOrphanedPayment(null);
        return;
      }

      // Vérifier le statut réel du paiement côté serveur
      if (persistedPayment.paymentId) {
        try {
          const { data: paymentData } = await supabase
            .from('payments')
            .select('status')
            .eq('id', persistedPayment.paymentId)
            .single();

          if (paymentData) {
            if (paymentData.status === 'paid') {
              // Le paiement a réussi via webhook, nettoyer et rafraîchir
              clearPersistedPaymentState();
              setOrphanedPayment(null);
              queryClient.invalidateQueries({ queryKey: ['patient-appointments'] });
              queryClient.invalidateQueries({ queryKey: ['payments'] });
              toast({
                title: '✅ Paiement confirmé',
                description: 'Votre paiement précédent a été validé avec succès.',
              });
              return;
            } else if (paymentData.status === 'failed' || paymentData.status === 'canceled') {
              // Le paiement a échoué, nettoyer
              clearPersistedPaymentState();
              setOrphanedPayment(null);
              return;
            }
          }
        } catch (error) {
          console.error('[OrphanedPayment] Error checking payment status:', error);
        }
      }

      // Le paiement est vraiment orphelin
      console.log('[OrphanedPayment] Found orphaned payment:', persistedPayment.appointmentId);
      setOrphanedPayment(persistedPayment);
    };

    checkOrphanedPayment();
  }, [queryClient]);

  // Récupérer un paiement orphelin
  const handleRecoverPayment = async () => {
    if (!orphanedPayment) return;

    setIsRecoveringPayment(true);

    try {
      // Synchroniser le statut avec FedaPay
      if (orphanedPayment.paymentId) {
        const { error } = await supabase.functions.invoke('sync-payment-status', {
          body: { paymentId: orphanedPayment.paymentId }
        });

        if (!error) {
          // Rafraîchir les données
          await queryClient.invalidateQueries({ queryKey: ['patient-appointments'] });
          await queryClient.invalidateQueries({ queryKey: ['payments'] });

          // Revérifier le statut
          const { data: paymentData } = await supabase
            .from('payments')
            .select('status')
            .eq('id', orphanedPayment.paymentId)
            .single();

          if (paymentData?.status === 'paid') {
            clearPersistedPaymentState();
            setOrphanedPayment(null);
            toast({
              title: '✅ Paiement confirmé',
              description: 'Votre paiement a été validé avec succès.',
            });
            return;
          }
        }
      }

      // Le paiement n'est pas encore confirmé, proposer de réessayer
      toast({
        title: 'Paiement non finalisé',
        description: 'Le paiement n\'a pas encore été confirmé. Vous pouvez réessayer ou annuler.',
        variant: 'destructive',
      });

    } catch (error) {
      console.error('[OrphanedPayment] Recovery error:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de vérifier le statut du paiement.',
        variant: 'destructive',
      });
    } finally {
      setIsRecoveringPayment(false);
    }
  };

  // Annuler un paiement orphelin
  const handleDismissOrphanedPayment = async () => {
    if (!orphanedPayment) return;

    try {
      // Essayer d'annuler le paiement côté serveur
      if (orphanedPayment.appointmentId) {
        await supabase.functions.invoke('cancel-pending-payment', {
          body: { appointmentId: orphanedPayment.appointmentId }
        });
      }
    } catch (error) {
      console.error('[OrphanedPayment] Cancel error:', error);
    }

    clearPersistedPaymentState();
    setOrphanedPayment(null);
    toast({
      title: 'Paiement annulé',
      description: 'Le paiement en cours a été annulé. Vous pouvez en créer un nouveau.',
    });
  };

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
      {/* Alerte paiement orphelin */}
      {orphanedPayment && (
        <Card className="border-orange-500 bg-orange-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Paiement interrompu détecté
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Un paiement a été initié mais n'a pas été finalisé. Vérifiez son statut ou annulez-le.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Montant:</span>{' '}
                  <span className="font-semibold">{formatAmount(orphanedPayment.amount)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Opérateur:</span>{' '}
                  <span className="font-semibold uppercase">{orphanedPayment.paymentMethod}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleRecoverPayment}
                  disabled={isRecoveringPayment}
                >
                  {isRecoveringPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Vérifier le statut
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDismissOrphanedPayment}
                  disabled={isRecoveringPayment}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Annuler
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                <p className="text-muted-foreground">Aucun rendez-vous à venir</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Utilisez le bouton "+ Nouveau rendez-vous" ci-dessus pour prendre rendez-vous.
                </p>
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

