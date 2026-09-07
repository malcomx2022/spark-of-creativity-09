import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  HelpCircle, Shield, Plus, Download, AlertCircle, RefreshCw,
  Clock, CheckCircle, XCircle, Filter, TicketIcon,
  ArrowUp, ArrowRight, ArrowDown, FileText, MessageSquareReply, BookOpen
} from 'lucide-react';
import { useSupportTickets, useCreateSupportTicket, useCloseSupportTicket, useFaqs } from '@/hooks/useSupportTickets';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useState, useMemo } from 'react';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

// Labels et couleurs pour les statuts
const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ElementType; color: string }> = {
  ouvert: { label: 'Ouvert', variant: 'default', icon: Clock, color: 'text-blue-500' },
  en_cours: { label: 'En cours', variant: 'secondary', icon: RefreshCw, color: 'text-orange-500' },
  resolu: { label: 'Résolu', variant: 'outline', icon: CheckCircle, color: 'text-green-500' },
  ferme: { label: 'Fermé', variant: 'outline', icon: XCircle, color: 'text-gray-500' },
};

// Labels et couleurs pour les priorités
const PRIORITY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  low: { label: 'Basse', icon: ArrowDown, color: 'text-green-500' },
  medium: { label: 'Moyenne', icon: ArrowRight, color: 'text-orange-500' },
  high: { label: 'Haute', icon: ArrowUp, color: 'text-red-500' },
};

export function SupportSection() {
  const navigate = useNavigate();
  const { data: user } = useAuthUser();
  const { data: tickets = [], isLoading, isFetching, refetch } = useSupportTickets(user?.id);
  const createTicket = useCreateSupportTicket();
  const closeTicket = useCloseSupportTicket();

  // FAQ publiques filtrées selon le type de compte (praticien / coach → praticiens, sinon patients)
  const userType = typeof user?.metadata?.user_type === 'string' ? user.metadata.user_type : undefined;
  const faqAudience = userType === 'practitioner' || userType === 'coach' ? 'practitioners' : 'patients';
  const { data: faqs = [] } = useFaqs(faqAudience);

  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
  });

  // Filtrer les tickets
  const filteredTickets = useMemo(() => {
    if (statusFilter === 'all') return tickets;
    return tickets.filter(t => t.status === statusFilter);
  }, [tickets, statusFilter]);

  // Statistiques
  const stats = useMemo(() => {
    return {
      total: tickets.length,
      ouvert: tickets.filter(t => t.status === 'ouvert').length,
      en_cours: tickets.filter(t => t.status === 'en_cours').length,
      resolu: tickets.filter(t => t.status === 'resolu').length,
    };
  }, [tickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // L'utilisateur est déduit du jeton par l'API
      await createTicket.mutateAsync(formData);
      setFormData({ subject: '', description: '', priority: 'medium' });
      setShowForm(false);
      toast({
        title: 'Ticket créé',
        description: 'Notre équipe vous répondra dans les plus brefs délais.',
      });
    } catch (error) {
      const message = errorMessage(error, 'Impossible de créer le ticket.');
      setSubmitError(message);
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    try {
      await closeTicket.mutateAsync(ticketId);
      toast({
        title: 'Ticket fermé',
        description: 'Votre ticket a été fermé.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de fermer le ticket.'),
        variant: 'destructive',
      });
    }
  };

  const formatTicketDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: fr });
  };

  const formatFullDate = (dateString: string) => {
    return format(new Date(dateString), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
  };

  const handleDataExport = async () => {
    if (!user?.id) return;

    try {
      toast({
        title: 'Export en cours',
        description: 'Préparation de vos données...',
      });

      // Export RGPD côté API : compte, profil, rendez-vous, profil médical, contacts, adresses, consentements, triages, avis
      const exportData = await api.get<Record<string, unknown>>('/medical/export');

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mes-donnees-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export réussi',
        description: 'Vos données ont été téléchargées.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: errorMessage(error, "Impossible d'exporter vos données."),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton en-tête */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton tickets */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Skeleton conformité */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            Support
            {stats.ouvert > 0 && (
              <Badge variant="destructive">{stats.ouvert} ouvert{stats.ouvert > 1 ? 's' : ''}</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Contactez notre équipe et gérez vos tickets
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TicketIcon className="h-4 w-4" />
              Total
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4 text-blue-500" />
              Ouverts
            </div>
            <p className="text-2xl font-bold text-blue-500">{stats.ouvert}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <RefreshCw className="h-4 w-4 text-orange-500" />
              En cours
            </div>
            <p className="text-2xl font-bold text-orange-500">{stats.en_cours}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Résolus
            </div>
            <p className="text-2xl font-bold text-green-500">{stats.resolu}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <TicketIcon className="h-5 w-5" />
              Mes tickets
              <Badge variant="secondary">{filteredTickets.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="ouvert">Ouverts</SelectItem>
                  <SelectItem value="en_cours">En cours</SelectItem>
                  <SelectItem value="resolu">Résolus</SelectItem>
                  <SelectItem value="ferme">Fermés</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'secondary' : 'default'} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nouveau ticket
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/50">
              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label htmlFor="subject">Sujet *</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Sujet de votre demande"
                  required
                />
              </div>
              <div>
                <Label htmlFor="priority">Priorité</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: 'low' | 'medium' | 'high') => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <ArrowDown className="h-4 w-4 text-green-500" />
                        Basse
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-orange-500" />
                        Moyenne
                      </div>
                    </SelectItem>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <ArrowUp className="h-4 w-4 text-red-500" />
                        Haute
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Décrivez votre problème ou question..."
                  rows={4}
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Envoi...' : 'Créer le ticket'}
                </Button>
                <Button type="button" variant="outline" onClick={() => {
                  setShowForm(false);
                  setSubmitError(null);
                }}>
                  Annuler
                </Button>
              </div>
            </form>
          )}

          {filteredTickets.length === 0 ? (
            <div className="text-center py-12">
              <TicketIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              {statusFilter !== 'all' ? (
                <>
                  <p className="text-muted-foreground">
                    Aucun ticket {STATUS_CONFIG[statusFilter]?.label.toLowerCase() || statusFilter}
                  </p>
                  <Button
                    variant="link"
                    onClick={() => setStatusFilter('all')}
                    className="mt-2"
                  >
                    Voir tous les tickets
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">Aucun ticket pour le moment</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Créez un ticket si vous avez besoin d'aide
                  </p>
                  <Button
                    onClick={() => setShowForm(true)}
                    className="mt-4"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Créer mon premier ticket
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => {
                const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.ouvert;
                const priorityConfig = PRIORITY_CONFIG[ticket.priority || 'medium'];
                const StatusIcon = statusConfig.icon;
                const PriorityIcon = priorityConfig.icon;

                return (
                  <div key={ticket.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusIcon className={`h-4 w-4 flex-shrink-0 ${statusConfig.color}`} />
                        <h4 className="font-medium truncate">{ticket.subject}</h4>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                <PriorityIcon className={`h-4 w-4 ${priorityConfig.color}`} />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Priorité {priorityConfig.label.toLowerCase()}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Badge variant={statusConfig.variant}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2 cursor-help">
                            {ticket.description}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <p className="whitespace-pre-wrap">{ticket.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {ticket.response && (
                      <div className="mt-2 mb-2 p-3 rounded-md bg-muted/50 border text-sm">
                        <div className="flex items-center gap-2 font-medium mb-1">
                          <MessageSquareReply className="h-4 w-4 text-primary" />
                          Réponse du support
                        </div>
                        <p className="whitespace-pre-wrap text-muted-foreground">{ticket.response}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-xs text-muted-foreground cursor-help">
                              Créé {formatTicketDate(ticket.created_at)}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatFullDate(ticket.created_at)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {(ticket.status === 'ouvert' || ticket.status === 'en_cours' || ticket.status === 'resolu') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleCloseTicket(ticket.id)}
                          disabled={closeTicket.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Fermer le ticket
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {faqs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Questions fréquentes
              <Badge variant="secondary">{faqs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">{faq.category}</Badge>
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Conformité & Données
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => navigate('/terms-of-service')}
            >
              <FileText className="h-4 w-4 mr-3" />
              Conditions générales d'utilisation
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => navigate('/privacy-policy')}
            >
              <Shield className="h-4 w-4 mr-3" />
              Politique de confidentialité
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={handleDataExport}
            >
              <Download className="h-4 w-4 mr-3" />
              Exporter mes données (RGPD)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
