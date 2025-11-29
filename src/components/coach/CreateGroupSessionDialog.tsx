import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { AddressSearchInput } from "@/components/AddressSearchInput";

interface CreateGroupSessionDialogProps {
  coachId: string;
}

export function CreateGroupSessionDialog({ coachId }: CreateGroupSessionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    session_name: "",
    session_type: "groupe",
    max_participants: 10,
    min_participants: 3,
    scheduled_date: "",
    start_time: "",
    end_time: "",
    price_per_person: 10000,
    location: "",
    description: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate min_participants <= max_participants
      if (formData.min_participants > formData.max_participants) {
        toast({
          title: "Erreur de validation",
          description: "Le nombre minimum de participants ne peut pas dépasser le maximum",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Validate date is in the future
      const sessionDate = new Date(formData.scheduled_date);
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (sessionDate < now) {
        toast({
          title: "Date invalide",
          description: "La date de la séance doit être dans le futur",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase
        .from("group_sessions")
        .insert({
          coach_id: coachId,
          ...formData
        });

      if (error) throw error;

      toast({
        title: "Séance créée !",
        description: "La séance de groupe a été créée avec succès",
      });

      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      
      setOpen(false);
      setFormData({
        session_name: "",
        session_type: "groupe",
        max_participants: 10,
        min_participants: 3,
        scheduled_date: "",
        start_time: "",
        end_time: "",
        price_per_person: 10000,
        location: "",
        description: ""
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="practitioner" className="gap-2">
          <Plus className="h-4 w-4" />
          Créer une séance de groupe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer une séance de groupe</DialogTitle>
          <DialogDescription>
            Planifiez une nouvelle séance pour vos clients
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="session_name">Nom de la séance *</Label>
              <Input
                id="session_name"
                placeholder="Ex: Yoga matinal, Cardio intensif..."
                value={formData.session_name}
                onChange={(e) => setFormData(prev => ({ ...prev, session_name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="session_type">Type de séance *</Label>
              <Select
                value={formData.session_type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, session_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individuelle">Individuelle</SelectItem>
                  <SelectItem value="duo">Duo</SelectItem>
                  <SelectItem value="groupe">Groupe</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price_per_person">Prix par personne (FCFA) *</Label>
              <Input
                id="price_per_person"
                type="number"
                min="10000"
                step="1000"
                value={formData.price_per_person}
                onChange={(e) => setFormData(prev => ({ ...prev, price_per_person: parseInt(e.target.value) }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_participants">Participants maximum *</Label>
              <Input
                id="max_participants"
                type="number"
                min="1"
                max="50"
                value={formData.max_participants}
                onChange={(e) => setFormData(prev => ({ ...prev, max_participants: parseInt(e.target.value) }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="min_participants">Participants minimum *</Label>
              <Input
                id="min_participants"
                type="number"
                min="1"
                value={formData.min_participants}
                onChange={(e) => setFormData(prev => ({ ...prev, min_participants: parseInt(e.target.value) }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduled_date">Date *</Label>
              <Input
                id="scheduled_date"
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_time">Heure de début *</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">Heure de fin *</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                required
              />
            </div>

            <div className="col-span-2 space-y-2">
              <AddressSearchInput
                label="Lieu *"
                value={formData.location}
                onChange={(locationData) => {
                  const fullAddress = locationData.city 
                    ? `${locationData.address}, ${locationData.city}`
                    : locationData.address;
                  setFormData(prev => ({ ...prev, location: fullAddress }));
                }}
                placeholder="Rechercher un lieu (ex: Parc de Hann, Plage de Ngor...)"
                required
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Décrivez la séance, les objectifs, le matériel nécessaire..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="practitioner" disabled={isSubmitting}>
              {isSubmitting ? "Création..." : "Créer la séance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}