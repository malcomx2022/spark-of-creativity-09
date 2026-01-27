import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MapPin, Star, AlertTriangle, Calendar, RefreshCw, User, Stethoscope } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useState, useMemo, useEffect } from 'react';

// Status labels in French
const statusLabels: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  no_show: 'Absence',
};

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'confirmed': return 'default';
    case 'completed': return 'secondary';
    case 'cancelled': return 'destructive';
    case 'no_show': return 'destructive';
    default: return 'outline';
  }
};

const renderStars = (rating: number) => {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      className={`h-4 w-4 ${
        i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
      }`}
    />
  ));
};

export function OperationsSection() {
  const queryClient = useQueryClient();
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [disputesPage, setDisputesPage] = useState(1);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<string>('all');
  const [resolutionComment, setResolutionComment] = useState('');
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const reviewsLimit = 20;
  const disputesLimit = 20;

  const { data: appointments = [], isLoading: appointmentsLoading, refetch: refetchAppointments } = useQuery({
    queryKey: ['admin-appointments-today', appointmentStatusFilter],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      let query = supabase
        .from('appointments')
        .select('*')
        .eq('date', today)
        .order('time', { ascending: true });

      // Apply status filter
      if (appointmentStatusFilter !== 'all') {
        query = query.eq('status', appointmentStatusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
  });

  // Realtime subscription for appointments
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    const channel = supabase
      .channel('admin-appointments-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `date=eq.${today}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['admin-appointments-today'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ['admin-reviews', reviewsPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('reviews')
        .select(`
          *,
          practitioner:practitioners!reviews_practitioner_id_fkey(id, name, specialty),
          patient:profiles!reviews_patient_id_fkey(id, full_name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((reviewsPage - 1) * reviewsLimit, reviewsPage * reviewsLimit - 1);

      if (error) throw error;
      return { reviews: data || [], total: count || 0 };
    },
  });

  const { data: disputesData, isLoading: disputesLoading } = useQuery({
    queryKey: ['admin-disputes', disputesPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('disputes')
        .select(`
          *,
          raised_by_profile:profiles!disputes_raised_by_fkey(id, full_name, phone),
          appointment:appointments!disputes_appointment_id_fkey(
            id, date, time, specialty, patient_name, practitioner_name
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((disputesPage - 1) * disputesLimit, disputesPage * disputesLimit - 1);

      if (error) throw error;
      return { disputes: data || [], total: count || 0 };
    },
  });

  const reviews = reviewsData?.reviews || [];
  const disputes = disputesData?.disputes || [];

  const updateReviewMutation = useMutation({
    mutationFn: async ({ id, isHidden }: { id: string; isHidden: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('reviews')
        .update({
          is_hidden: isHidden,
          moderated_by: user?.id,
          moderated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      toast({ title: 'Avis modéré' });
      setSelectedReview(null);
    },
  });

  const updateDisputeMutation = useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: string; resolution?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      // Add resolution and resolved_at if status is resolved or closed
      if ((status === 'resolved' || status === 'closed') && resolution) {
        updateData.resolution = resolution;
        updateData.resolved_at = new Date().toISOString();
      }

      // Assign to current admin if investigating
      if (status === 'investigating' && user) {
        updateData.assigned_to = user.id;
      }

      const { error } = await supabase
        .from('disputes')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Add audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: `Dispute ${status}`,
          entity_type: 'dispute',
          entity_id: id,
          details: { status, resolution },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      toast({ title: 'Litige mis à jour' });
      setResolutionComment('');
      setSelectedDispute(null);
    },
  });

  const stats = useMemo(() => ({
    todayAppointments: appointments.length,
    pendingReviews: reviews.filter(r => !r.is_hidden && !r.moderated_at).length,
    openDisputes: disputes.filter(d => d.status === 'open').length,
    inProgressDisputes: disputes.filter(d => d.status === 'investigating').length,
  }), [appointments, reviews, disputes]);

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              RDV aujourd'hui
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayAppointments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avis en attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingReviews}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Litiges ouverts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.openDisputes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Litiges en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgressDisputes}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments">RDV en temps réel</TabsTrigger>
          <TabsTrigger value="reviews">Modération avis</TabsTrigger>
          <TabsTrigger value="disputes">Litiges</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Rendez-vous du jour
                  </CardTitle>
                  <CardDescription>Suivi en temps réel des consultations</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={appointmentStatusFilter} onValueChange={setAppointmentStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Filtrer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="confirmed">Confirmés</SelectItem>
                      <SelectItem value="completed">Terminés</SelectItem>
                      <SelectItem value="cancelled">Annulés</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => refetchAppointments()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {appointmentsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun rendez-vous aujourd'hui
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Heure</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Praticien</TableHead>
                      <TableHead>Spécialité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Adresse</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.map((apt) => (
                      <TableRow key={apt.id}>
                        <TableCell className="font-medium">{apt.time}</TableCell>
                        <TableCell>{apt.patient_name}</TableCell>
                        <TableCell>{apt.practitioner_name || 'Non assigné'}</TableCell>
                        <TableCell>{apt.specialty}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(apt.status)}>
                            {statusLabels[apt.status] || apt.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{apt.address}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Modération des avis
              </CardTitle>
              <CardDescription>Valider ou masquer les commentaires inappropriés</CardDescription>
            </CardHeader>
            <CardContent>
              {reviewsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun avis
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review: any) => (
                    <div key={review.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {renderStars(review.rating)}
                          <Badge variant={review.is_hidden ? 'destructive' : 'default'}>
                            {review.is_hidden ? 'Masqué' : 'Visible'}
                          </Badge>
                          {review.moderated_at && (
                            <Badge variant="outline" className="text-xs">
                              Modéré
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>

                      {/* Patient and Practitioner info */}
                      <div className="flex flex-wrap gap-4 mb-2 text-sm text-muted-foreground">
                        {review.patient && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {review.patient.full_name || 'Patient inconnu'}
                          </span>
                        )}
                        {review.practitioner && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="h-3 w-3" />
                            {review.practitioner.name} ({review.practitioner.specialty})
                          </span>
                        )}
                      </div>

                      {review.comment && <p className="text-sm mb-3">{review.comment}</p>}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={review.is_hidden ? 'default' : 'destructive'}
                          onClick={() =>
                            updateReviewMutation.mutate({
                              id: review.id,
                              isHidden: !review.is_hidden,
                            })
                          }
                          disabled={updateReviewMutation.isPending}
                        >
                          {review.is_hidden ? 'Afficher' : 'Masquer'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Pagination */}
              {!reviewsLoading && reviews.length > 0 && (
                <div className="flex items-center justify-between mt-4 px-4">
                  <p className="text-sm text-muted-foreground">
                    Affichage {(reviewsPage - 1) * reviewsLimit + 1} à {Math.min(reviewsPage * reviewsLimit, reviewsData?.total || 0)} sur {reviewsData?.total || 0}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewsPage(p => Math.max(1, p - 1))}
                      disabled={reviewsPage === 1}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewsPage(p => p + 1)}
                      disabled={reviewsPage * reviewsLimit >= (reviewsData?.total || 0)}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Gestion des litiges
              </CardTitle>
              <CardDescription>Résoudre les conflits entre patients et praticiens</CardDescription>
            </CardHeader>
            <CardContent>
              {disputesLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : disputes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun litige
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Sujet</TableHead>
                      <TableHead>Signalé par</TableHead>
                      <TableHead>RDV concerné</TableHead>
                      <TableHead>Priorité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disputes.map((dispute: any) => (
                      <TableRow key={dispute.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(dispute.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{dispute.subject}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">{dispute.raised_by_profile?.full_name || 'Inconnu'}</p>
                            {dispute.raised_by_profile?.phone && (
                              <p className="text-muted-foreground text-xs">{dispute.raised_by_profile.phone}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {dispute.appointment ? (
                            <div className="text-sm">
                              <p>{dispute.appointment.date} à {dispute.appointment.time}</p>
                              <p className="text-muted-foreground text-xs">
                                {dispute.appointment.practitioner_name} - {dispute.appointment.specialty}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              dispute.priority === 'high'
                                ? 'destructive'
                                : dispute.priority === 'medium'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {dispute.priority === 'high' ? 'Haute' : dispute.priority === 'medium' ? 'Moyenne' : 'Basse'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              dispute.status === 'open' ? 'destructive' :
                              dispute.status === 'investigating' ? 'secondary' :
                              dispute.status === 'resolved' ? 'default' : 'outline'
                            }
                          >
                            {dispute.status === 'open' ? 'Ouvert' :
                             dispute.status === 'investigating' ? 'En cours' :
                             dispute.status === 'resolved' ? 'Résolu' : 'Fermé'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Dialog
                            open={selectedDispute?.id === dispute.id}
                            onOpenChange={(open) => {
                              if (open) {
                                setSelectedDispute(dispute);
                                setResolutionComment(dispute.resolution || '');
                              } else {
                                setSelectedDispute(null);
                                setResolutionComment('');
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                Gérer
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Gérer le litige</DialogTitle>
                                <DialogDescription>{dispute.subject}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                {/* Dispute info */}
                                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                  {dispute.raised_by_profile && (
                                    <div className="flex items-center gap-2 text-sm">
                                      <User className="h-4 w-4 text-muted-foreground" />
                                      <span>Signalé par: <strong>{dispute.raised_by_profile.full_name}</strong></span>
                                    </div>
                                  )}
                                  {dispute.appointment && (
                                    <div className="flex items-center gap-2 text-sm">
                                      <Calendar className="h-4 w-4 text-muted-foreground" />
                                      <span>RDV: {dispute.appointment.date} à {dispute.appointment.time}</span>
                                    </div>
                                  )}
                                  {dispute.appointment && (
                                    <div className="flex items-center gap-2 text-sm">
                                      <Stethoscope className="h-4 w-4 text-muted-foreground" />
                                      <span>Praticien: {dispute.appointment.practitioner_name}</span>
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <Label>Description du problème</Label>
                                  <p className="text-sm text-muted-foreground mt-1 bg-muted/30 p-2 rounded">
                                    {dispute.description}
                                  </p>
                                </div>

                                {/* Resolution comment for resolved/closed */}
                                <div>
                                  <Label htmlFor="resolution-comment">Commentaire de résolution</Label>
                                  <Textarea
                                    id="resolution-comment"
                                    placeholder="Décrivez comment le litige a été résolu..."
                                    value={resolutionComment}
                                    onChange={(e) => setResolutionComment(e.target.value)}
                                    className="mt-1"
                                  />
                                </div>

                                <div>
                                  <Label>Changer le statut</Label>
                                  <div className="grid grid-cols-2 gap-2 mt-2">
                                    <Button
                                      variant={dispute.status === 'investigating' ? 'default' : 'outline'}
                                      size="sm"
                                      onClick={() => updateDisputeMutation.mutate({
                                        id: dispute.id,
                                        status: 'investigating',
                                      })}
                                      disabled={updateDisputeMutation.isPending || dispute.status === 'investigating'}
                                    >
                                      Prendre en charge
                                    </Button>
                                    <Button
                                      variant={dispute.status === 'resolved' ? 'default' : 'outline'}
                                      size="sm"
                                      onClick={() => updateDisputeMutation.mutate({
                                        id: dispute.id,
                                        status: 'resolved',
                                        resolution: resolutionComment,
                                      })}
                                      disabled={updateDisputeMutation.isPending || !resolutionComment.trim()}
                                    >
                                      Marquer résolu
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => updateDisputeMutation.mutate({
                                        id: dispute.id,
                                        status: 'open',
                                      })}
                                      disabled={updateDisputeMutation.isPending || dispute.status === 'open'}
                                    >
                                      Rouvrir
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => updateDisputeMutation.mutate({
                                        id: dispute.id,
                                        status: 'closed',
                                        resolution: resolutionComment || 'Fermé sans résolution',
                                      })}
                                      disabled={updateDisputeMutation.isPending}
                                    >
                                      Fermer
                                    </Button>
                                  </div>
                                </div>

                                {/* Show existing resolution if any */}
                                {dispute.resolution && dispute.resolved_at && (
                                  <div className="border-t pt-3">
                                    <Label className="text-green-600">Résolution précédente</Label>
                                    <p className="text-sm mt-1">{dispute.resolution}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Résolu le {new Date(dispute.resolved_at).toLocaleDateString('fr-FR')}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {/* Pagination */}
            {!disputesLoading && disputes.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Affichage {(disputesPage - 1) * disputesLimit + 1} à {Math.min(disputesPage * disputesLimit, disputesData?.total || 0)} sur {disputesData?.total || 0}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDisputesPage(p => Math.max(1, p - 1))}
                    disabled={disputesPage === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDisputesPage(p => p + 1)}
                    disabled={disputesPage * disputesLimit >= (disputesData?.total || 0)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  </div>
);
}
