import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PractitionerLocation } from '@/types/practitioner';

function mapPractitioner(row: any, isPublicView: boolean = false): PractitionerLocation {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty ?? 'Spécialité non renseignée',
    // Pour la vue publique, pas d'adresse ni de coordonnées GPS exactes
    address: isPublicView ? (row.intervention_zone ?? row.communes_served?.[0] ?? 'Zone non précisée') : (row.address ?? 'Adresse à préciser'),
    latitude: isPublicView ? 0 : (row.latitude ?? 0),
    longitude: isPublicView ? 0 : (row.longitude ?? 0),
    available: row.available ?? false,
    rating: row.rating ?? 0,
    phone: isPublicView ? '' : (row.phone ?? ''),
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
  // Check if user is authenticated
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    // Authenticated users can access full practitioner data
    const { data, error } = await supabase
      .from('practitioners')
      .select('*')
      .or('available.eq.true,can_accept_missions.eq.true')
      .eq('kyc_status', 'approved')
      .order('name', { ascending: true });

    if (error) {
      if (import.meta.env.DEV) {
        console.error('Erreur chargement praticiens:', error);
      }
      throw error;
    }

    return (data ?? []).map(row => mapPractitioner(row, false));
  } else {
    // Unauthenticated users use the public view with limited data (no GPS, phone, address)
    const { data, error } = await supabase
      .from('practitioners_public_view')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      if (import.meta.env.DEV) {
        console.error('Erreur chargement praticiens publics:', error);
      }
      throw new Error('Impossible de charger la liste des praticiens. Veuillez vous connecter pour plus de détails.');
    }

    return (data ?? []).map(row => mapPractitioner(row, true));
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
