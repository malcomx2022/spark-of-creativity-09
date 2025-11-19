import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

interface AddEmergencyContactDialogProps {
  userId: string;
}

export function AddEmergencyContactDialog({ userId }: AddEmergencyContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    relationship: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('emergency_contacts')
        .insert({
          user_id: userId,
          ...formData,
        });

      if (error) throw error;

      toast({
        title: 'Contact ajouté',
        description: 'Le contact d\'urgence a été ajouté avec succès.',
      });

      queryClient.invalidateQueries({ queryKey: ['emergency-contacts', userId] });
      setFormData({ name: '', phone: '', relationship: '' });
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'ajouter le contact.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-4">
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un contact
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>Ajouter un contact d'urgence</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nom complet *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Jean Dupont"
            />
          </div>
          <div>
            <Label htmlFor="phone">Téléphone *</Label>
            <PhoneInput
              id="phone"
              value={formData.phone}
              onChange={(value) => setFormData({ ...formData, phone: value })}
              countryCode="+229"
              localNumberLength={8}
            />
          </div>
          <div>
            <Label htmlFor="relationship">Relation</Label>
            <Input
              id="relationship"
              value={formData.relationship}
              onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
              placeholder="Époux, Parent, Ami..."
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Ajout...' : 'Ajouter'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
