import { useQuery } from '@tanstack/react-query';
import { api, auth } from '@/lib/api';
import type { PractitionerLocation } from '@/types/practitioner';

/** Colonnes publiques renvoyées par `GET /practitioners` (ex `practitioners_public_view`). */
export interface PublicPractitionerRow {
  id: string;
  name: string;
  specialty: string | null;
  practitioner_type: string | null;
  rating: number | null;
  available: boolean | null;
  years_experience: number | null;
  bio: string | null;
  languages: string[] | null;
  communes_served: string[] | null;
  intervention_zone: string | null;
  intervention_radius: number | null;
  certifications: string[] | null;
  session_types: string[] | null;
  image: string | null;
}

function mapPractitioner(row: PublicPractitionerRow): PractitionerLocation {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty ?? 'Spécialité non renseignée',
    // L'API n'expose ni l'adresse ni les coordonnées GPS exactes ni le téléphone des praticiens.
    address: row.intervention_zone ?? row.communes_served?.[0] ?? 'Zone non précisée',
    latitude: 0,
    longitude: 0,
    available: row.available ?? false,
    rating: row.rating ?? 0,
    phone: '',
    image: row.image ?? undefined,
    practitioner_type: row.practitioner_type ?? undefined,
    // Données supplémentaires de la vue publique
    bio: row.bio ?? undefined,
    years_experience: row.years_experience ?? undefined,
    communes_served: row.communes_served ?? undefined,
    intervention_zone: row.intervention_zone ?? undefined,
  };
}

async function fetchPractitioners() {
  // ✅ CORRECTION P0-5 & P1-12: pour un utilisateur connecté, uniquement les praticiens
  // disponibles ET pouvant accepter des missions ET en ligne (KYC approuvé dans les deux cas).
  const onlineOnly = !!auth.getSession();

  try {
    const rows = await api.get<PublicPractitionerRow[]>('/practitioners', { query: { onlineOnly: onlineOnly || undefined, limit: 200 } });
    return rows.map(mapPractitioner);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Erreur chargement praticiens:', error);
    }
    if (onlineOnly) throw error;
    throw new Error('Impossible de charger la liste des praticiens. Veuillez vous connecter pour plus de détails.');
  }
}

export function usePractitioners() {
  return useQuery<PractitionerLocation[]>({
    queryKey: ['practitioners'],
    queryFn: fetchPractitioners,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
