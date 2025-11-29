export const COACH_REVENUE_RATE = 0.95; // 95% pour le coach, 5% commission plateforme
export const MIN_SESSION_PRICE = 5000; // Prix minimum en FCFA

export interface SessionFormData {
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

export interface ValidationError {
  title: string;
  description: string;
}

export function validateSessionForm(formData: SessionFormData): ValidationError | null {
  // Validate min_participants <= max_participants
  if (formData.min_participants > formData.max_participants) {
    return {
      title: "Erreur de validation",
      description: "Le nombre minimum de participants ne peut pas dépasser le maximum"
    };
  }

  // Validate date is in the future
  const sessionDate = new Date(formData.scheduled_date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (sessionDate < now) {
    return {
      title: "Date invalide",
      description: "La date de la séance doit être dans le futur"
    };
  }

  // Validate start_time < end_time
  const [startHours, startMinutes] = formData.start_time.split(':').map(Number);
  const [endHours, endMinutes] = formData.end_time.split(':').map(Number);
  const startTimeMinutes = startHours * 60 + startMinutes;
  const endTimeMinutes = endHours * 60 + endMinutes;

  if (startTimeMinutes >= endTimeMinutes) {
    return {
      title: "Horaires invalides",
      description: "L'heure de début doit être avant l'heure de fin"
    };
  }

  // Validate minimum price
  if (formData.price_per_person < MIN_SESSION_PRICE) {
    return {
      title: "Prix invalide",
      description: `Le prix minimum est de ${MIN_SESSION_PRICE.toLocaleString()} FCFA`
    };
  }

  return null;
}
