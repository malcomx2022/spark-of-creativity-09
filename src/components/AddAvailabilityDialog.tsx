import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useCreateAvailability } from '@/hooks/useAvailability';
import { Plus } from 'lucide-react';

interface AddAvailabilityDialogProps {
  practitionerId: string;
  trigger?: React.ReactNode;
}

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function AddAvailabilityDialog({ practitionerId, trigger }: AddAvailabilityDialogProps) {
  const [open, setOpen] = useState(false);
  const createAvailability = useCreateAvailability();
  
  const [formData, setFormData] = useState({
    day_of_week: 1,
    start_time: '09:00',
    end_time: '17:00',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation: l'heure de fin doit être après l'heure de début
    if (formData.start_time >= formData.end_time) {
      toast({
        title: 'Horaires invalides',
        description: 'L\'heure de fin doit être après l\'heure de début.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createAvailability.mutateAsync({
        practitioner_id: practitionerId,
        ...formData,
      });

      toast({
        title: 'Créneau ajouté',
        description: 'Le créneau de disponibilité a été ajouté avec succès.',
      });

      setFormData({ day_of_week: 1, start_time: '09:00', end_time: '17:00' });
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
        toast({
          title: 'Créneau déjà existant',
          description: `Ce créneau existe déjà pour le ${DAYS_FR[formData.day_of_week]}. Veuillez choisir un autre horaire.`,
          variant: 'destructive',
        });
      } else {
        console.error('[Availability] Erreur lors de l\'ajout du créneau:', error);
        toast({
          title: 'Erreur',
          description: 'Impossible d\'ajouter le créneau. Veuillez réessayer.',
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un créneau
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>Ajouter un créneau de disponibilité</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="day">Jour de la semaine</Label>
            <Select
              value={formData.day_of_week.toString()}
              onValueChange={(value) => setFormData({ ...formData, day_of_week: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {DAYS_FR.map((day, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">Heure de début</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="end_time">Heure de fin</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={createAvailability.isPending}>
              {createAvailability.isPending ? 'Ajout...' : 'Ajouter'}
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
