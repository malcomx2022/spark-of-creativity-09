import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, onTableChange } from '@/lib/api';
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

/** Ligne de GET /admin/support/faqs. */
interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  target_audience: string | null;
  is_published: boolean | null;
  created_at: string;
}

export function SupportSection() {
  const queryClient = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<TicketWithUser | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [ticketResponse, setTicketResponse] = useState<string>('');
  // Filtres pour tickets
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  // États pour la gestion des FAQs
  const [showFaqDialog, setShowFaqDialog] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const [faqToDelete, setFaqToDelete] = useState<Faq | null>(null);
  const [faqForm, setFaqForm] = useState({
    question: '',
    answer: '',
    category: 'Général',
    target_audience: 'all',
  });

  // Local type for ticket with user profile
  interface TicketWithUser {
    id: string;
    user_id: string;
    subject: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    updated_at: string;
    admin_response?: string;
    responded_at?: string;
    responded_by?: string;
    user?: {
      id: string;
      full_name?: string;
      phone?: string;
    };
  }

  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } = useQuery<TicketWithUser[]>({
    queryKey: ['admin-support-tickets'],
    queryFn: async () => {
      // Tickets avec le profil du demandeur aplati (GET /admin/support/tickets)
      const res = await api.get<{ data: Array<Omit<TicketWithUser, 'user'> & { user_full_name: string | null; user_phone: string | null }> }>('/admin/support/tickets', { query: { limit: 100 } });
      return res.data.map(({ user_full_name, user_phone, ...ticket }) => ({
        ...ticket,
        user: { id: ticket.user_id, full_name: user_full_name ?? undefined, phone: user_phone ?? undefined },
      }));
    },
  });

  // Realtime subscription pour les tickets
  useEffect(() => {
    return onTableChange('support_tickets', () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
    });
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
      return api.get<Faq[]>('/admin/support/faqs');
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, status, response }: { id: string; status: 'ouvert' | 'en_cours' | 'resolu' | 'ferme'; response?: string }) => {
      // Statut, réponse et journal d'audit gérés par l'API
      await api.patch(`/admin/support/tickets/${id}`, { status, ...(response ? { response } : {}) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      toast({ title: 'Ticket mis à jour' });
      setSelectedTicket(null);
      setNewStatus('');
      setTicketResponse('');
    },
    onError: (error: unknown) => {
      toast({ title: 'Erreur', description: errorMessage(error, 'Opération impossible'), variant: 'destructive' });
    },
  });

  // Mutations pour les FAQs
  const createFaqMutation = useMutation({
    mutationFn: async (faq: typeof faqForm) => {
      await api.post('/admin/support/faqs', { question: faq.question, answer: faq.answer, category: faq.category, targetAudience: faq.target_audience });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      toast({ title: 'FAQ créée avec succès' });
      setShowFaqDialog(false);
      resetFaqForm();
    },
    onError: (error: unknown) => {
      toast({ title: 'Erreur', description: errorMessage(error, 'Opération impossible'), variant: 'destructive' });
    },
  });

  const updateFaqMutation = useMutation({
    mutationFn: async ({ id, ...faq }: { id: string } & Partial<typeof faqForm> & { is_published?: boolean }) => {
      await api.patch(`/admin/support/faqs/${id}`, {
        ...(faq.question !== undefined ? { question: faq.question } : {}),
        ...(faq.answer !== undefined ? { answer: faq.answer } : {}),
        ...(faq.category !== undefined ? { category: faq.category } : {}),
        ...(faq.target_audience !== undefined ? { targetAudience: faq.target_audience } : {}),
        ...(faq.is_published !== undefined ? { isPublished: faq.is_published } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      toast({ title: 'FAQ mise à jour' });
      setShowFaqDialog(false);
      setEditingFaq(null);
      resetFaqForm();
    },
    onError: (error: unknown) => {
      toast({ title: 'Erreur', description: errorMessage(error, 'Opération impossible'), variant: 'destructive' });
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/support/faqs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      toast({ title: 'FAQ supprimée' });
      setFaqToDelete(null);
    },
    onError: (error: unknown) => {
      toast({ title: 'Erreur', description: errorMessage(error, 'Opération impossible'), variant: 'destructive' });
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

  const openEditFaq = (faq: Faq) => {
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
