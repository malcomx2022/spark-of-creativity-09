import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { useCreateException } from '@/hooks/useAvailability';
import { Plus } from 'lucide-react';

interface AddExceptionDialogProps {
  practitionerId: string;
  trigger?: React.ReactNode;
}

export function AddExceptionDialog({ practitionerId, trigger }: AddExceptionDialogProps) {
  const [open, setOpen] = useState(false);
  const createException = useCreateException();
  
  const [formData, setFormData] = useState({
    date: '',
    is_available: false,
    reason: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createException.mutateAsync({
        practitioner_id: practitionerId,
        ...formData,
      });

      toast({
        title: 'Exception ajoutée',
        description: 'L\'exception a été ajoutée avec succès.',
      });

      setFormData({ date: '', is_available: false, reason: '' });
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'ajouter l\'exception.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Ajouter une exception
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>Ajouter une exception</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="is_available"
              checked={formData.is_available}
              onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
            />
            <Label htmlFor="is_available">
              {formData.is_available ? 'Disponibilité exceptionnelle' : 'Indisponibilité'}
            </Label>
          </div>
          <div>
            <Label htmlFor="reason">Raison</Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Congés, formation, urgence..."
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createException.isPending}>
              {createException.isPending ? 'Ajout...' : 'Ajouter'}
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
