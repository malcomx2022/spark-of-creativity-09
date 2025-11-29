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
import { MapPin, Star, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useState, useMemo } from 'react';

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
  const reviewsLimit = 20;
  const disputesLimit = 20;

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery({
    queryKey: ['admin-appointments-today'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', today)
        .order('time', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ['admin-reviews', reviewsPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('reviews')
        .select('*', { count: 'exact' })
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
        .select('*', { count: 'exact' })
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
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('disputes')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      toast({ title: 'Litige mis à jour' });
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
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Rendez-vous du jour
              </CardTitle>
              <CardDescription>Suivi en temps réel des consultations</CardDescription>
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
                          <Badge
                            variant={
                              apt.status === 'confirmed'
                                ? 'default'
                                : apt.status === 'completed'
                                ? 'outline'
                                : 'secondary'
                            }
                          >
                            {apt.status}
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
                  {reviews.map((review) => (
                    <div key={review.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {renderStars(review.rating)}
                          <Badge variant={review.is_hidden ? 'destructive' : 'default'}>
                            {review.is_hidden ? 'Masqué' : 'Visible'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString('fr-FR')}
                        </p>
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
                      <TableHead>Priorité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disputes.map((dispute) => (
                      <TableRow key={dispute.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(dispute.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{dispute.subject}</TableCell>
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
                            {dispute.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{dispute.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                Gérer
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Gérer le litige</DialogTitle>
                                <DialogDescription>{dispute.subject}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label>Description</Label>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {dispute.description}
                                  </p>
                                </div>
                                <div>
                                  <Label htmlFor="dispute-status">Changer le statut</Label>
                                  <Select
                                    defaultValue={dispute.status}
                                    onValueChange={(value: 'open' | 'investigating' | 'resolved' | 'closed') =>
                                      updateDisputeMutation.mutate({
                                        id: dispute.id,
                                        status: value,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="open">Ouvert</SelectItem>
                                      <SelectItem value="investigating">En cours</SelectItem>
                                      <SelectItem value="resolved">Résolu</SelectItem>
                                      <SelectItem value="closed">Fermé</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
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
