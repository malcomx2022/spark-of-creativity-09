import { useEffect, useState, useMemo } from 'react';
import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import GPSTracking from '@/components/GPSTracking';
import { useAuthUser } from '@/hooks/useAuthUser';
import { usePatientAppointments, useMutateAppointment, useCreateAppointment } from '@/hooks/useAppointments';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, Calendar, Clock, CreditCard, FileText, RefreshCw, XCircle, ChevronLeft, ChevronRight, Filter, ArrowUpDown, CheckCircle2, TimerIcon, Ban } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatAmount } from '@/lib/payment-config';
import { getPersistedPaymentState, clearPersistedPaymentState, PersistedPaymentState } from '@/lib/payment-storage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Colonnes de `GET /payments` utilisées par l'onglet. */
interface PaymentSummary {
  id: string;
  appointment_id: string;
  status: string;
  payout_status: string | null;
}

interface AppointmentsTabProps {
  onPaymentRequired: (appointmentId: string) => void;
}

export default function AppointmentsTab({ onPaymentRequired }: AppointmentsTabProps) {
  const { data: user } = useAuthUser();
  const patientId = user?.id;
  const patientName = (user?.metadata?.full_name as string | undefined) || user?.email || 'Patient';
  const queryClient = useQueryClient();

  const [orphanedPayment, setOrphanedPayment] = useState<PersistedPaymentState | null>(null);
  const [isRecoveringPayment, setIsRecoveringPayment] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  // Filtres
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: appointmentsResult, isLoading, refetch, isFetching } = usePatientAppointments(patientId, currentPage, pageSize);
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
          const paymentData = await api.get<PaymentSummary>(`/payments/${persistedPayment.paymentId}`);

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
        let synced = false;
        try {
          await api.post(`/payments/${orphanedPayment.paymentId}/sync`);
          synced = true;
        } catch (error) {
          console.warn('[OrphanedPayment] Sync error:', errorMessage(error));
        }

        if (synced) {
          // Rafraîchir les données
          await queryClient.invalidateQueries({ queryKey: ['patient-appointments'] });
          await queryClient.invalidateQueries({ queryKey: ['payments'] });

          // Revérifier le statut
          const paymentData = await api.get<PaymentSummary>(`/payments/${orphanedPayment.paymentId}`);

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
      // Essayer d'annuler le paiement côté serveur (POST /payments/:id/cancel)
      let paymentId = orphanedPayment.paymentId;
      if (!paymentId && orphanedPayment.appointmentId) {
        const open = await api.get<PaymentSummary[]>('/payments', { query: { appointmentId: orphanedPayment.appointmentId, limit: 5 } });
        paymentId = open.find((p) => ['initiated', 'pending', 'authorized'].includes(p.status))?.id ?? null;
      }
      if (paymentId) {
        await api.post(`/payments/${paymentId}/cancel`);
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
      // L'utilisateur est déduit du jeton
      return api.get<PaymentSummary[]>('/payments', { query: { limit: 100 } });
    },
    enabled: !!patientId,
  });

  const handleCancel = async (id: string) => {
    try {
      // POST /appointments/:id/cancel (annule aussi le paiement en attente)
      await mutateAppointment.mutateAsync({ id, action: 'cancel' });
      toast({
        title: 'Rendez-vous annulé',
        description: 'Le rendez-vous a été annulé avec succès.'
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible d\'annuler le rendez-vous.'),
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

  // Statistiques des rendez-vous
  const stats = useMemo(() => {
    const allAppointments = appointments || [];
    return {
      total: allAppointments.length,
      confirmed: allAppointments.filter(a => a.status === 'confirmed').length,
      awaiting: allAppointments.filter(a => a.status === 'awaiting_practitioner' || a.status === 'pending_payment').length,
      completed: allAppointments.filter(a => a.status === 'completed').length,
      cancelled: allAppointments.filter(a => a.status === 'cancelled' || a.status === 'rejected').length,
    };
  }, [appointments]);

  // Filtrage et tri des rendez-vous
  const filteredAndSortedAppointments = useMemo(() => {
    let filtered = [...appointments];

    // Appliquer le filtre par statut
    if (statusFilter !== 'all') {
      filtered = filtered.filter(apt => {
        if (statusFilter === 'confirmed') return apt.status === 'confirmed';
        if (statusFilter === 'awaiting') return apt.status === 'awaiting_practitioner' || apt.status === 'pending_payment';
        if (statusFilter === 'completed') return apt.status === 'completed';
        if (statusFilter === 'cancelled') return apt.status === 'cancelled' || apt.status === 'rejected';
        return true;
      });
    }

    // Appliquer le tri
    filtered.sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`);
      const dateB = new Date(`${b.date}T${b.time}`);
      return sortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
    });

    return filtered;
  }, [appointments, statusFilter, sortOrder]);

  const upcomingAppointments = filteredAndSortedAppointments.filter(
    apt => apt.status !== 'completed' && apt.status !== 'cancelled' && apt.status !== 'rejected'
  );
  const pastAppointments = filteredAndSortedAppointments.filter(
    apt => apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'rejected'
  );

  // Pagination
  const totalPages = Math.ceil((appointmentsResult?.count || 0) / pageSize);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Confirmés</p>
              <p className="text-lg font-bold text-green-600">{stats.confirmed}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <TimerIcon className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-lg font-bold text-orange-600">{stats.awaiting}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-xs text-muted-foreground">Terminés</p>
              <p className="text-lg font-bold text-gray-600">{stats.completed}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Annulés</p>
              <p className="text-lg font-bold text-red-600">{stats.cancelled}</p>
            </div>
          </div>
        </Card>
      </div>

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
              <div className="flex-1 space-y-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">Montant:</span>{' '}
                  <span className="font-semibold">{formatAmount(orphanedPayment.amount)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Opérateur:</span>{' '}
                  <span className="font-semibold uppercase">{orphanedPayment.paymentMethod}</span>
                </p>
                {orphanedPayment.appointmentId && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">RDV ID:</span>{' '}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono text-xs bg-muted px-1 rounded cursor-help">
                            {orphanedPayment.appointmentId.substring(0, 8)}...
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">{orphanedPayment.appointmentId}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Initié le {new Date(orphanedPayment.lastUpdated).toLocaleString('fr-FR')}
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold">Mes rendez-vous</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Rafraîchir"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre par statut */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="confirmed">Confirmés</SelectItem>
              <SelectItem value="awaiting">En attente</SelectItem>
              <SelectItem value="completed">Terminés</SelectItem>
              <SelectItem value="cancelled">Annulés</SelectItem>
            </SelectContent>
          </Select>

          {/* Tri */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="h-9"
          >
            <ArrowUpDown className="h-4 w-4 mr-2" />
            {sortOrder === 'desc' ? 'Plus récent' : 'Plus ancien'}
          </Button>

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
                <p className="text-sm text-muted-foreground mt-2">
                  Les rendez-vous terminés ou annulés apparaîtront ici.
                </p>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Page {currentPage + 1} sur {totalPages} ({appointmentsResult?.count || 0} rendez-vous)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0 || isFetching}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1 || isFetching}
            >
              Suivant
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

