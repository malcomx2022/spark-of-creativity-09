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
import { MessageSquare, BookOpen, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

export function SupportSection() {
  const queryClient = useQueryClient();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<string>('');

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ['admin-support-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const { data: faqs = [], isLoading: faqsLoading } = useQuery({
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
    mutationFn: async ({ id, status }: { id: string; status: 'ouvert' | 'en_cours' | 'resolu' | 'ferme' }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      toast({ title: 'Ticket mis à jour' });
      setSelectedTicket(null);
    },
  });

  const stats = {
    openTickets: tickets.filter(t => t.status === 'ouvert').length,
    inProgressTickets: tickets.filter(t => t.status === 'en_cours').length,
    totalFaqs: faqs.length,
    publishedFaqs: faqs.filter(f => f.is_published).length,
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      ouvert: 'Ouvert',
      en_cours: 'En cours',
      resolu: 'Résolu',
      ferme: 'Fermé',
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string) => {
    const variants: Record<string, any> = {
      ouvert: 'destructive',
      en_cours: 'secondary',
      resolu: 'default',
      ferme: 'outline',
    };
    return variants[status] || 'outline';
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
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                File de support
              </CardTitle>
              <CardDescription>Gérer les demandes d'assistance utilisateurs</CardDescription>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun ticket
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
                    {tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(ticket.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>{ticket.user_id.slice(0, 8)}...</TableCell>
                        <TableCell className="max-w-xs truncate">{ticket.subject}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              ticket.priority === 'high'
                                ? 'destructive'
                                : ticket.priority === 'medium'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {ticket.priority}
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
                                onClick={() => setSelectedTicket(ticket)}
                              >
                                Gérer
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Gérer le ticket</DialogTitle>
                                <DialogDescription>{ticket.subject}</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label>Description</Label>
                                  <p className="text-sm text-muted-foreground mt-1">
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
                                <Button
                                  className="w-full"
                                  onClick={() =>
                                    updateTicketMutation.mutate({
                                      id: ticket.id,
                                      status: (newStatus || ticket.status) as 'ouvert' | 'en_cours' | 'resolu' | 'ferme',
                                    })
                                  }
                                  disabled={updateTicketMutation.isPending}
                                >
                                  Mettre à jour
                                </Button>
                              </div>
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
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Base de connaissances
                  </CardTitle>
                  <CardDescription>Gérer les questions fréquentes</CardDescription>
                </div>
                <Button>Ajouter une FAQ</Button>
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
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium">{faq.question}</h4>
                          <Badge variant="outline" className="mt-1">
                            {faq.category}
                          </Badge>
                        </div>
                        <Badge variant={faq.is_published ? 'default' : 'secondary'}>
                          {faq.is_published ? 'Publié' : 'Brouillon'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
