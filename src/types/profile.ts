export type Gender = 'homme' | 'femme' | 'autre' | 'non_specifie';
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'inconnu';
export type ConsentType = 'cgu' | 'charte' | 'partage_donnees' | 'marketing';
export type TicketStatus = 'ouvert' | 'en_cours' | 'resolu' | 'ferme';

export interface Profile {
  id: string;
  full_name?: string;
  phone?: string;
  gender?: Gender;
  date_of_birth?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relationship?: string;
  created_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  address: string;
  city?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  is_default: boolean;
  created_at: string;
}

export interface MedicalProfile {
  id: string;
  user_id: string;
  blood_type?: BloodType;
  allergies?: string;
  chronic_diseases?: string;
  current_medications?: string;
  additional_notes?: string;
  share_with_practitioner: boolean;
  // Médecin traitant
  primary_doctor_id?: string;
  primary_doctor_name?: string;
  primary_doctor_email?: string;
  primary_doctor_phone?: string;
  created_at: string;
  updated_at: string;
}

export interface TriageResult {
  id: string;
  user_id: string;
  score: number;
  urgency_level: string;
  message?: string;
  recommendations?: string[];
  answers?: Record<string, any>;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  category?: string;
  base_price?: number;
  duration?: number;
  is_active: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  appointment_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  appointment_id: string;
  patient_id: string;
  practitioner_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  appointment_id?: string;
  subject: string;
  description: string;
  status: TicketStatus;
  attachments?: string[];
  created_at: string;
  updated_at: string;
}

export interface Consent {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  is_accepted: boolean;
  accepted_at?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
  created_at: string;
  updated_at: string;
}
