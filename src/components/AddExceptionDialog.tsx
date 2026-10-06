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

    // Validation: la date ne doit pas être dans le passé
    const selectedDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      toast({
        title: 'Date invalide',
        description: 'Vous ne pouvez pas ajouter une exception pour une date passée.',
        variant: 'destructive',
      });
      return;
    }

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
    } catch (error: unknown) {
      // Détecter l'erreur de contrainte UNIQUE (code PostgreSQL 23505)
      const errorMessage = (error instanceof Error ? error.message : String(error ?? "")) || '';
      const isUniqueViolation =
        errorMessage.includes('23505') ||
        errorMessage.includes('unique') ||
        errorMessage.includes('duplicate') ||
        errorMessage.includes('already exists') ||
        (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505');

      if (isUniqueViolation) {
        const formattedDate = new Date(formData.date).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        toast({
          title: 'Exception déjà existante',
          description: `Une exception existe déjà pour le ${formattedDate}. Supprimez-la d'abord ou modifiez-la.`,
          variant: 'destructive',
        });
      } else {
        console.error('[Exception] Erreur lors de l\'ajout de l\'exception:', error);
        toast({
          title: 'Erreur',
          description: 'Impossible d\'ajouter l\'exception. Veuillez réessayer.',
          variant: 'destructive',
        });
      }
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
