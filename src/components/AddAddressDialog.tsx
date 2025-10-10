import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

interface AddAddressDialogProps {
  userId: string;
}

export function AddAddressDialog({ userId }: AddAddressDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    label: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'Bénin',
    is_default: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('addresses')
        .insert({
          user_id: userId,
          ...formData,
        });

      if (error) throw error;

      toast({
        title: 'Adresse ajoutée',
        description: 'L\'adresse a été ajoutée avec succès.',
      });

      queryClient.invalidateQueries({ queryKey: ['addresses', userId] });
      setFormData({
        label: '',
        address: '',
        city: '',
        postal_code: '',
        country: 'Bénin',
        is_default: false,
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'ajouter l\'adresse.',
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
          Ajouter une adresse
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-background max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter une adresse</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="label">Libellé *</Label>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              required
              placeholder="Domicile, Bureau..."
            />
          </div>
          <div>
            <Label htmlFor="address">Adresse complète *</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
              placeholder="123 Rue de l'Exemple"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">Ville *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
                placeholder="Cotonou"
              />
            </div>
            <div>
              <Label htmlFor="postal_code">Code postal</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="01234"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="country">Pays</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="Bénin"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="is_default"
              checked={formData.is_default}
              onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
            />
            <Label htmlFor="is_default">Définir comme adresse par défaut</Label>
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
