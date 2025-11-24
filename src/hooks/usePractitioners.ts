import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PractitionerLocation } from '@/types/practitioner';

function mapPractitioner(row: any): PractitionerLocation {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty ?? 'Spécialité non renseignée',
    address: row.address ?? 'Adresse à préciser',
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    available: row.available ?? false,
    rating: row.rating ?? 0,
    phone: row.phone ?? '',
    image: row.image ?? undefined,
    practitioner_type: row.practitioner_type ?? undefined,
  };
}

async function fetchPractitioners() {
  const { data, error } = await supabase
    .from('practitioners')
    .select('*')
    .eq('available', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Erreur chargement praticiens:', error);
    throw error;
  }

  return (data ?? []).map(mapPractitioner);
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
