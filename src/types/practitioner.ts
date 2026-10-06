export interface PractitionerLocation {
  id: string;
  name: string;
  specialty: string;
  address: string;
  latitude: number;
  longitude: number;
  distance?: number;
  available: boolean;
  rating: number;
  phone: string;
  image?: string;
  practitioner_type?: string;
  intervention_zone?: string;
  bio?: string;
  years_experience?: number;
  communes_served?: string[];
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

/** Profil privé de GET /practitioners/me ; ne pas utiliser pour le catalogue public. */
export interface PractitionerProfile {
  id: string;
  name: string;
  user_id?: string;
  practitioner_type?: string | null;
  kyc_status?: string | null;
  kyc_comment?: string | null;
  can_accept_missions?: boolean | null;
  is_online?: boolean | null;
  bio?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  diplomas?: string[] | null;
  languages?: string[] | null;
  years_experience?: number | null;
  intervention_radius?: number | null;
  intervention_zone?: string | null;
  communes_served?: string[] | null;
  certifications?: string[] | null;
  session_types?: string[] | null;
  image?: string | null;
  license_number?: string | null;
  id_document_url?: string | null;
  license_document_url?: string | null;
  insurance_document_url?: string | null;
  updated_at?: string;
}
