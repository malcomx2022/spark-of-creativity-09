import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressSearchInput } from "@/components/AddressSearchInput";
import { MIN_SESSION_PRICE } from "@/lib/session-validation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";

export interface GroupSessionFormData {
  session_name: string;
  session_type: string;
  max_participants: number;
  min_participants: number;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  price_per_person: number;
  location: string;
  description: string;
}

interface GroupSessionFormProps {
  formData: GroupSessionFormData;
  onChange: (data: GroupSessionFormData) => void;
}

export function GroupSessionForm({ formData, onChange }: GroupSessionFormProps) {
  const { data: user } = useSupabaseUser();
  
  // Vérifier que l'utilisateur est bien un coach sportif
  const { data: practitionerProfile } = useQuery({
    queryKey: ['practitioner-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('practitioners')
        .select('practitioner_type')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  // Si ce n'est pas un coach sportif, afficher un message
  if (practitionerProfile && practitionerProfile.practitioner_type !== 'coach_sportif') {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <div className="text-5xl">🏋️</div>
          <h3 className="text-xl font-semibold">Fonctionnalité réservée aux coachs sportifs</h3>
          <p className="text-muted-foreground">
            Les séances de groupe sont uniquement disponibles pour les praticiens de type "Coach sportif".
            Votre type actuel est : <Badge>{practitionerProfile.practitioner_type}</Badge>
          </p>
        </div>
      </Card>
    );
  }

  const updateField = (field: keyof GroupSessionFormData, value: any) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 space-y-2">
        <Label htmlFor="session_name">Nom de la séance *</Label>
        <Input
          id="session_name"
          placeholder="Ex: Yoga matinal, Cardio intensif..."
          value={formData.session_name}
          onChange={(e) => updateField('session_name', e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="session_type">Type de séance *</Label>
        <Select
          value={formData.session_type}
          onValueChange={(value) => updateField('session_type', value)}
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
          min={MIN_SESSION_PRICE}
          step="1000"
          value={formData.price_per_person}
          onChange={(e) => updateField('price_per_person', parseInt(e.target.value))}
          required
        />
        <p className="text-xs text-muted-foreground">
          Prix minimum: {MIN_SESSION_PRICE.toLocaleString()} FCFA
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="max_participants">Participants maximum *</Label>
        <Input
          id="max_participants"
          type="number"
          min="1"
          max="50"
          value={formData.max_participants}
          onChange={(e) => updateField('max_participants', parseInt(e.target.value))}
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
          onChange={(e) => updateField('min_participants', parseInt(e.target.value))}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="scheduled_date">Date *</Label>
        <Input
          id="scheduled_date"
          type="date"
          value={formData.scheduled_date}
          onChange={(e) => updateField('scheduled_date', e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="start_time">Heure de début *</Label>
        <Input
          id="start_time"
          type="time"
          value={formData.start_time}
          onChange={(e) => updateField('start_time', e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="end_time">Heure de fin *</Label>
        <Input
          id="end_time"
          type="time"
          value={formData.end_time}
          onChange={(e) => updateField('end_time', e.target.value)}
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
            updateField('location', fullAddress);
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
          onChange={(e) => updateField('description', e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );
}
