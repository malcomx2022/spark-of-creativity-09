import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, BookOpen, AlertCircle, RefreshCw, Filter, Plus, Pencil, Trash2, Eye, EyeOff, User } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useState, useMemo, useEffect } from 'react';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
  urgent: 'Urgente',
};

const FAQ_CATEGORIES = [
  'Général',
  'Paiements',
  'Rendez-vous',
  'Compte',
  'Praticiens',
  'Technique',
];

export function SupportSection() {
  const queryClient = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [ticketResponse, setTicketResponse] = useState<string>('');
  // Filtres pour tickets
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  // États pour la gestion des FAQs
  const [showFaqDialog, setShowFaqDialog] = useState(false);
  const [editingFaq, setEditingFaq] = useState<any>(null);
  const [faqToDelete, setFaqToDelete] = useState<any>(null);
  const [faqForm, setFaqForm] = useState({
    question: '',
    answer: '',
    category: 'Général',
    target_audience: 'all',
  });

  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useQuery({
    queryKey: ['admin-support-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          user:profiles!support_tickets_user_id_fkey(id, full_name, phone)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Realtime subscription pour les tickets
  useEffect(() => {
    const channel = supabase
      .channel('admin-support-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'support_tickets',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Filtrage des tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;
      return matchesStatus && matchesPriority;
    });
  }, [tickets, statusFilter, priorityFilter]);

  const { data: faqs = [], isLoading: faqsLoading, refetch: refetchFaqs } = useQuery({
    queryKey: ['admin-faqs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faqs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, status, response }: { id: string; status: 'ouvert' | 'en_cours' | 'resolu' | 'ferme'; response?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const updateData: any = { status };
      if (response) {
        updateData.admin_response = response;
        updateData.responded_at = new Date().toISOString();
        updateData.responded_by = user?.id;
      }

      const { error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // Audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'update_ticket_status',
          entity_type: 'support_ticket',
          entity_id: id,
          details: { status, has_response: !!response },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      toast({ title: 'Ticket mis à jour' });
      setSelectedTicket(null);
      setNewStatus('');
      setTicketResponse('');
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  // Mutations pour les FAQs
  const createFaqMutation = useMutation({
    mutationFn: async (faq: typeof faqForm) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('faqs')
        .insert({
          ...faq,
          created_by: user?.id,
          is_published: false,
        });

      if (error) throw error;

      // Audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'create_faq',
          entity_type: 'faq',
          details: { question: faq.question, category: faq.category },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      toast({ title: 'FAQ créée avec succès' });
      setShowFaqDialog(false);
      resetFaqForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  const updateFaqMutation = useMutation({
    mutationFn: async ({ id, ...faq }: { id: string } & Partial<typeof faqForm> & { is_published?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('faqs')
        .update({
          ...faq,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: faq.is_published !== undefined ? (faq.is_published ? 'publish_faq' : 'unpublish_faq') : 'update_faq',
          entity_type: 'faq',
          entity_id: id,
          details: faq,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      toast({ title: 'FAQ mise à jour' });
      setShowFaqDialog(false);
      setEditingFaq(null);
      resetFaqForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('faqs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'delete_faq',
          entity_type: 'faq',
          entity_id: id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      toast({ title: 'FAQ supprimée' });
      setFaqToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  const resetFaqForm = () => {
    setFaqForm({
      question: '',
      answer: '',
      category: 'Général',
      target_audience: 'all',
    });
  };

  const openEditFaq = (faq: any) => {
    setEditingFaq(faq);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      target_audience: faq.target_audience || 'all',
    });
    setShowFaqDialog(true);
  };

  const handleSaveFaq = () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      toast({ title: 'Erreur', description: 'Question et réponse requises', variant: 'destructive' });
      return;
    }

    if (editingFaq) {
      updateFaqMutation.mutate({ id: editingFaq.id, ...faqForm });
    } else {
      createFaqMutation.mutate(faqForm);
    }
  };

  const stats = useMemo(() => ({
    openTickets: tickets.filter(t => t.status === 'ouvert').length,
    inProgressTickets: tickets.filter(t => t.status === 'en_cours').length,
    totalFaqs: faqs.length,
    publishedFaqs: faqs.filter(f => f.is_published).length,
  }), [tickets, faqs]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      ouvert: 'Ouvert',
      en_cours: 'En cours',
      resolu: 'Résolu',
      ferme: 'Fermé',
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      ouvert: 'destructive',
      en_cours: 'secondary',
      resolu: 'default',
      ferme: 'outline',
    };
    return variants[status] || 'outline';
  };

  const getPriorityVariant = (priority: string): "default" | "secondary" | "outline" | "destructive" => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      urgent: 'destructive',
      high: 'destructive',
      medium: 'secondary',
      low: 'outline',
    };
    return variants[priority] || 'outline';
  };

  const getTargetAudienceLabel = (audience: string) => {
    const labels: Record<string, string> = {
      all: 'Tous',
      patients: 'Patients',
      practitioners: 'Praticiens',
    };
    return labels[audience] || audience;
  };

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tickets ouverts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.openTickets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tickets en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgressTickets}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              FAQs publiées
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.publishedFaqs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total FAQs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalFaqs}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="faqs">Base de connaissances</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    File de support
                  </CardTitle>
                  <CardDescription>Gérer les demandes d'assistance utilisateurs</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Statut" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous statuts</SelectItem>
                        <SelectItem value="ouvert">Ouvert</SelectItem>
                        <SelectItem value="en_cours">En cours</SelectItem>
                        <SelectItem value="resolu">Résolu</SelectItem>
                        <SelectItem value="ferme">Fermé</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Priorité" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes priorités</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                        <SelectItem value="high">Haute</SelectItem>
                        <SelectItem value="medium">Moyenne</SelectItem>
                        <SelectItem value="low">Basse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => refetchTickets()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : filteredTickets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {statusFilter !== 'all' || priorityFilter !== 'all'
                    ? 'Aucun ticket correspondant aux filtres'
                    : 'Aucun ticket'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Sujet</TableHead>
                      <TableHead>Priorité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(ticket.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{ticket.user?.full_name || 'Utilisateur inconnu'}</p>
                              {ticket.user?.phone && (
                                <p className="text-xs text-muted-foreground">{ticket.user.phone}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{ticket.subject}</TableCell>
                        <TableCell>
                          <Badge variant={getPriorityVariant(ticket.priority)}>
                            {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(ticket.status)}>
                            {getStatusLabel(ticket.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedTicket(ticket);
                                  setNewStatus(ticket.status);
                                  setTicketResponse(ticket.admin_response || '');
                                }}
                              >
                                Gérer
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader>
                                <DialogTitle>Gérer le ticket</DialogTitle>
                                <DialogDescription>{ticket.subject}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-muted-foreground">Utilisateur</Label>
                                    <p className="text-sm font-medium">{ticket.user?.full_name || 'Inconnu'}</p>
                                    {ticket.user?.phone && <p className="text-xs text-muted-foreground">{ticket.user.phone}</p>}
                                  </div>
                                  <div>
                                    <Label className="text-muted-foreground">Créé le</Label>
                                    <p className="text-sm">{new Date(ticket.created_at).toLocaleString('fr-FR')}</p>
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-muted-foreground">Description</Label>
                                  <p className="text-sm mt-1 p-3 bg-muted rounded-md">
                                    {ticket.description}
                                  </p>
                                </div>
                                <div>
                                  <Label htmlFor="status">Changer le statut</Label>
                                  <Select
                                    value={newStatus || ticket.status}
                                    onValueChange={setNewStatus}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ouvert">Ouvert</SelectItem>
                                      <SelectItem value="en_cours">En cours</SelectItem>
                                      <SelectItem value="resolu">Résolu</SelectItem>
                                      <SelectItem value="ferme">Fermé</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label htmlFor="response">Réponse admin</Label>
                                  <Textarea
                                    id="response"
                                    placeholder="Tapez votre réponse à l'utilisateur..."
                                    value={ticketResponse}
                                    onChange={(e) => setTicketResponse(e.target.value)}
                                    rows={4}
                                  />
                                  {ticket.responded_at && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Dernière réponse: {new Date(ticket.responded_at).toLocaleString('fr-FR')}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <DialogFooter>
                                <Button
                                  className="w-full"
                                  onClick={() =>
                                    updateTicketMutation.mutate({
                                      id: ticket.id,
                                      status: (newStatus || ticket.status) as 'ouvert' | 'en_cours' | 'resolu' | 'ferme',
                                      response: ticketResponse || undefined,
                                    })
                                  }
                                  disabled={updateTicketMutation.isPending}
                                >
                                  {updateTicketMutation.isPending ? 'Mise à jour...' : 'Mettre à jour'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faqs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Base de connaissances
                  </CardTitle>
                  <CardDescription>Gérer les questions fréquentes</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => refetchFaqs()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => {
                    setEditingFaq(null);
                    resetFaqForm();
                    setShowFaqDialog(true);
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter une FAQ
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {faqsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : faqs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune FAQ
                </div>
              ) : (
                <div className="space-y-4">
                  {faqs.map((faq) => (
                    <div key={faq.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium">{faq.question}</h4>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="outline">{faq.category}</Badge>
                            <Badge variant="secondary">
                              {getTargetAudienceLabel(faq.target_audience)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{faq.answer}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant={faq.is_published ? 'default' : 'secondary'}>
                            {faq.is_published ? 'Publié' : 'Brouillon'}
                          </Badge>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateFaqMutation.mutate({ id: faq.id, is_published: !faq.is_published })}
                              title={faq.is_published ? 'Dépublier' : 'Publier'}
                            >
                              {faq.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditFaq(faq)}
                              title="Modifier"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setFaqToDelete(faq)}
                              className="text-destructive hover:text-destructive"
                              title="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog pour créer/éditer une FAQ */}
      <Dialog open={showFaqDialog} onOpenChange={(open) => {
        if (!open) {
          setShowFaqDialog(false);
          setEditingFaq(null);
          resetFaqForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFaq ? 'Modifier la FAQ' : 'Créer une FAQ'}</DialogTitle>
            <DialogDescription>
              {editingFaq
                ? 'Modifiez les informations de la FAQ'
                : 'Remplissez les informations pour créer une nouvelle FAQ'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="faq-question">Question *</Label>
              <Input
                id="faq-question"
                placeholder="Comment puis-je...?"
                value={faqForm.question}
                onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="faq-answer">Réponse *</Label>
              <Textarea
                id="faq-answer"
                placeholder="Voici la réponse..."
                value={faqForm.answer}
                onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="faq-category">Catégorie</Label>
                <Select
                  value={faqForm.category}
                  onValueChange={(v) => setFaqForm({ ...faqForm, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAQ_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="faq-audience">Public cible</Label>
                <Select
                  value={faqForm.target_audience}
                  onValueChange={(v) => setFaqForm({ ...faqForm, target_audience: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="patients">Patients</SelectItem>
                    <SelectItem value="practitioners">Praticiens</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowFaqDialog(false);
                setEditingFaq(null);
                resetFaqForm();
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveFaq}
              disabled={createFaqMutation.isPending || updateFaqMutation.isPending}
            >
              {createFaqMutation.isPending || updateFaqMutation.isPending
                ? 'Enregistrement...'
                : editingFaq ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation de suppression FAQ */}
      <AlertDialog open={!!faqToDelete} onOpenChange={(open) => !open && setFaqToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette FAQ ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de supprimer la FAQ:
              <br />
              <strong className="mt-2 block">"{faqToDelete?.question}"</strong>
              <br />
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => faqToDelete && deleteFaqMutation.mutate(faqToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteFaqMutation.isPending}
            >
              {deleteFaqMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
