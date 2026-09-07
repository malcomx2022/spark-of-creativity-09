import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressSearchInput } from "@/components/AddressSearchInput";
import { MIN_SESSION_PRICE, MAX_SESSION_PRICE, MAX_PARTICIPANTS, MIN_PARTICIPANTS } from "@/lib/session-validation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";

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
  fieldErrors?: Record<string, string>;
}

export function GroupSessionForm({ formData, onChange, fieldErrors = {} }: GroupSessionFormProps) {
  const { data: user } = useAuthUser();
  
  // Vérifier que l'utilisateur est bien un coach sportif
  const { data: practitionerProfile } = useQuery({
    queryKey: ['practitioner-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      try {
        return await api.get<{ practitioner_type: string | null }>('/practitioners/me');
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
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

  const updateField = (field: keyof GroupSessionFormData, value: unknown) => {
    onChange({ ...formData, [field]: value });
  };

  // Handlers pour les champs numériques avec validation
  const handleNumberChange = (field: 'max_participants' | 'min_participants' | 'price_per_person', value: string) => {
    const parsed = parseInt(value, 10);
    
    if (field === 'price_per_person') {
      // Garder la valeur même si invalide pour permettre l'édition, mais borner
      const safeValue = isNaN(parsed) ? MIN_SESSION_PRICE : Math.max(0, Math.min(MAX_SESSION_PRICE, parsed));
      updateField(field, safeValue);
    } else {
      // Participants
      const safeValue = isNaN(parsed) ? MIN_PARTICIPANTS : Math.max(MIN_PARTICIPANTS, Math.min(MAX_PARTICIPANTS, parsed));
      updateField(field, safeValue);
    }
  };

  // Calculer la date minimum (aujourd'hui)
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2 space-y-2">
        <Label htmlFor="session_name">Nom de la séance *</Label>
        <Input
          id="session_name"
          placeholder="Ex: Yoga matinal, Cardio intensif..."
          value={formData.session_name}
          onChange={(e) => updateField('session_name', e.target.value)}
          maxLength={100}
          className={cn(fieldErrors.session_name && "border-destructive")}
          required
        />
        {fieldErrors.session_name && (
          <p className="text-xs text-destructive">{fieldErrors.session_name}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="session_type">Type de séance *</Label>
        <Select
          value={formData.session_type}
          onValueChange={(value) => updateField('session_type', value)}
        >
          <SelectTrigger className={cn(fieldErrors.session_type && "border-destructive")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="individuelle">Individuelle</SelectItem>
            <SelectItem value="duo">Duo</SelectItem>
            <SelectItem value="groupe">Groupe</SelectItem>
          </SelectContent>
        </Select>
        {fieldErrors.session_type && (
          <p className="text-xs text-destructive">{fieldErrors.session_type}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="price_per_person">Prix par personne (FCFA) *</Label>
        <Input
          id="price_per_person"
          type="number"
          min={MIN_SESSION_PRICE}
          max={MAX_SESSION_PRICE}
          step="500"
          value={formData.price_per_person}
          onChange={(e) => handleNumberChange('price_per_person', e.target.value)}
          className={cn(fieldErrors.price_per_person && "border-destructive")}
          required
        />
        <p className="text-xs text-muted-foreground">
          Min: {MIN_SESSION_PRICE.toLocaleString()} FCFA
        </p>
        {fieldErrors.price_per_person && (
          <p className="text-xs text-destructive">{fieldErrors.price_per_person}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="max_participants">Participants maximum *</Label>
        <Input
          id="max_participants"
          type="number"
          min={MIN_PARTICIPANTS}
          max={MAX_PARTICIPANTS}
          value={formData.max_participants}
          onChange={(e) => handleNumberChange('max_participants', e.target.value)}
          className={cn(fieldErrors.max_participants && "border-destructive")}
          required
        />
        {fieldErrors.max_participants && (
          <p className="text-xs text-destructive">{fieldErrors.max_participants}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="min_participants">Participants minimum *</Label>
        <Input
          id="min_participants"
          type="number"
          min={MIN_PARTICIPANTS}
          max={formData.max_participants}
          value={formData.min_participants}
          onChange={(e) => handleNumberChange('min_participants', e.target.value)}
          className={cn(fieldErrors.min_participants && "border-destructive")}
          required
        />
        {fieldErrors.min_participants && (
          <p className="text-xs text-destructive">{fieldErrors.min_participants}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="scheduled_date">Date *</Label>
        <Input
          id="scheduled_date"
          type="date"
          min={today}
          value={formData.scheduled_date}
          onChange={(e) => updateField('scheduled_date', e.target.value)}
          className={cn(fieldErrors.scheduled_date && "border-destructive")}
          required
        />
        {fieldErrors.scheduled_date && (
          <p className="text-xs text-destructive">{fieldErrors.scheduled_date}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="start_time">Heure de début *</Label>
        <Input
          id="start_time"
          type="time"
          value={formData.start_time}
          onChange={(e) => updateField('start_time', e.target.value)}
          className={cn(fieldErrors.start_time && "border-destructive")}
          required
        />
        {fieldErrors.start_time && (
          <p className="text-xs text-destructive">{fieldErrors.start_time}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="end_time">Heure de fin *</Label>
        <Input
          id="end_time"
          type="time"
          value={formData.end_time}
          onChange={(e) => updateField('end_time', e.target.value)}
          className={cn(fieldErrors.end_time && "border-destructive")}
          required
        />
        {fieldErrors.end_time && (
          <p className="text-xs text-destructive">{fieldErrors.end_time}</p>
        )}
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
        {fieldErrors.location && (
          <p className="text-xs text-destructive">{fieldErrors.location}</p>
        )}
      </div>

      <div className="col-span-2 space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Décrivez la séance, les objectifs, le matériel nécessaire..."
          value={formData.description}
          onChange={(e) => updateField('description', e.target.value)}
          maxLength={2000}
          rows={3}
          className={cn(fieldErrors.description && "border-destructive")}
        />
        <p className="text-xs text-muted-foreground">
          {formData.description.length}/2000 caractères
        </p>
        {fieldErrors.description && (
          <p className="text-xs text-destructive">{fieldErrors.description}</p>
        )}
      </div>
    </div>
  );
}
