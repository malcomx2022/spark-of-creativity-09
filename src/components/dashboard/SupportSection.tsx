import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HelpCircle, Shield, Plus } from 'lucide-react';
import { useSupportTickets, useCreateSupportTicket } from '@/hooks/useSupportTickets';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export function SupportSection() {
  const { data: user } = useSupabaseUser();
  const { data: tickets = [], isLoading } = useSupportTickets(user?.id);
  const createTicket = useCreateSupportTicket();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      await createTicket.mutateAsync({
        user_id: user.id,
        ...formData,
      });
      setFormData({ subject: '', description: '', priority: 'medium' });
      setShowForm(false);
      toast({
        title: 'Ticket créé',
        description: 'Notre équipe vous répondra dans les plus brefs délais.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de créer le ticket.',
        variant: 'destructive',
      });
    }
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
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      ouvert: 'default',
      en_cours: 'secondary',
      resolu: 'outline',
      ferme: 'outline',
    };
    return variants[status] || 'outline';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Aide & Support
            </CardTitle>
            <Button onClick={() => setShowForm(!showForm)} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nouveau ticket
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div>
                <Label htmlFor="subject">Sujet</Label>
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
                  onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
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
                <Button type="submit" disabled={createTicket.isPending}>
                  {createTicket.isPending ? 'Envoi...' : 'Créer le ticket'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          )}

          <div>
            <h3 className="font-medium mb-3">Mes tickets</h3>
            {isLoading ? (
              <p className="text-muted-foreground">Chargement...</p>
            ) : tickets.length === 0 ? (
              <p className="text-muted-foreground">Aucun ticket pour le moment</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">{ticket.subject}</h4>
                      <Badge variant={getStatusVariant(ticket.status)}>
                        {getStatusLabel(ticket.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{ticket.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Créé le {new Date(ticket.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border rounded-lg">
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Conformité & Consentements
            </h3>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer">
                <Shield className="h-4 w-4" />
                Conditions générales d'utilisation
              </p>
              <p className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer">
                <Shield className="h-4 w-4" />
                Politique de confidentialité
              </p>
              <p className="flex items-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer">
                <Shield className="h-4 w-4" />
                Export de mes données
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
