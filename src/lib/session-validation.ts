import { z } from 'zod';

export const COACH_REVENUE_RATE = 0.63; // 63% pour le coach, 37% commission plateforme (taux officiel Domicares)
export const MIN_SESSION_PRICE = 5000; // Prix minimum en FCFA
export const MAX_SESSION_PRICE = 500000; // Prix maximum en FCFA
export const MAX_PARTICIPANTS = 100;
export const MIN_PARTICIPANTS = 1;

const SESSION_TYPES = ['individuelle', 'duo', 'groupe'] as const;
type SessionType = typeof SESSION_TYPES[number];

// Schéma de validation Zod pour les séances de groupe
export const sessionFormSchema = z.object({
  session_name: z.string()
    .trim()
    .min(3, { message: "Le nom de la séance doit contenir au moins 3 caractères" })
    .max(100, { message: "Le nom de la séance ne peut pas dépasser 100 caractères" }),
  
  session_type: z.enum(SESSION_TYPES, {
    message: "Type de séance invalide"
  }),
  
  max_participants: z.number()
    .int({ message: "Le nombre de participants doit être un entier" })
    .min(MIN_PARTICIPANTS, { message: `Minimum ${MIN_PARTICIPANTS} participant` })
    .max(MAX_PARTICIPANTS, { message: `Maximum ${MAX_PARTICIPANTS} participants` }),
  
  min_participants: z.number()
    .int({ message: "Le nombre de participants doit être un entier" })
    .min(MIN_PARTICIPANTS, { message: `Minimum ${MIN_PARTICIPANTS} participant` })
    .max(MAX_PARTICIPANTS, { message: `Maximum ${MAX_PARTICIPANTS} participants` }),
  
  scheduled_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format de date invalide (AAAA-MM-JJ)" }),
  
  start_time: z.string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Format d'heure invalide (HH:MM)" }),
  
  end_time: z.string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: "Format d'heure invalide (HH:MM)" }),
  
  price_per_person: z.number()
    .int({ message: "Le prix doit être un nombre entier" })
    .min(MIN_SESSION_PRICE, { message: `Le prix minimum est de ${MIN_SESSION_PRICE.toLocaleString()} FCFA` })
    .max(MAX_SESSION_PRICE, { message: `Le prix maximum est de ${MAX_SESSION_PRICE.toLocaleString()} FCFA` }),
  
  location: z.string()
    .trim()
    .min(5, { message: "Le lieu doit contenir au moins 5 caractères" })
    .max(200, { message: "Le lieu ne peut pas dépasser 200 caractères" }),
  
  description: z.string()
    .trim()
    .max(2000, { message: "La description ne peut pas dépasser 2000 caractères" })
    .optional()
    .default("")
}).refine((data) => data.min_participants <= data.max_participants, {
  message: "Le nombre minimum de participants ne peut pas dépasser le maximum",
  path: ["min_participants"]
}).refine((data) => {
  const sessionDate = new Date(data.scheduled_date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return sessionDate >= now;
}, {
  message: "La date de la séance doit être dans le futur",
  path: ["scheduled_date"]
}).refine((data) => {
  const [startHours, startMinutes] = data.start_time.split(':').map(Number);
  const [endHours, endMinutes] = data.end_time.split(':').map(Number);
  const startTimeMinutes = startHours * 60 + startMinutes;
  const endTimeMinutes = endHours * 60 + endMinutes;
  return startTimeMinutes < endTimeMinutes;
}, {
  message: "L'heure de début doit être avant l'heure de fin",
  path: ["end_time"]
});

export type SessionFormData = z.infer<typeof sessionFormSchema>;

export interface ValidationError {
  title: string;
  description: string;
  field?: string;
}

// Fonction de validation legacy pour compatibilité
export function validateSessionForm(formData: SessionFormData): ValidationError | null {
  const result = sessionFormSchema.safeParse(formData);
  
  if (!result.success) {
    const errors = result.error.issues;
    const firstError = errors[0];
    return {
      title: "Erreur de validation",
      description: firstError?.message || "Données invalides",
      field: firstError?.path[0] as string
    };
  }
  
  return null;
}

// Fonction pour nettoyer et normaliser les données du formulaire
export function sanitizeSessionFormData(rawData: {
  session_name?: string;
  session_type?: string;
  max_participants?: number;
  min_participants?: number;
  scheduled_date?: string;
  start_time?: string;
  end_time?: string;
  price_per_person?: number;
  location?: string;
  description?: string;
}): {
  session_name: string;
  session_type: SessionType;
  max_participants: number;
  min_participants: number;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  price_per_person: number;
  location: string;
  description: string;
} {
  const sessionType = rawData.session_type as SessionType;
  const validSessionType = SESSION_TYPES.includes(sessionType) ? sessionType : 'groupe';
  
  return {
    session_name: String(rawData.session_name ?? '').trim(),
    session_type: validSessionType,
    max_participants: Math.max(MIN_PARTICIPANTS, Math.min(MAX_PARTICIPANTS, Number(rawData.max_participants) || 10)),
    min_participants: Math.max(MIN_PARTICIPANTS, Math.min(MAX_PARTICIPANTS, Number(rawData.min_participants) || 1)),
    scheduled_date: String(rawData.scheduled_date ?? ''),
    start_time: String(rawData.start_time ?? ''),
    end_time: String(rawData.end_time ?? ''),
    price_per_person: Math.max(MIN_SESSION_PRICE, Math.min(MAX_SESSION_PRICE, Number(rawData.price_per_person) || MIN_SESSION_PRICE)),
    location: String(rawData.location ?? '').trim(),
    description: String(rawData.description ?? '').trim()
  };
}
