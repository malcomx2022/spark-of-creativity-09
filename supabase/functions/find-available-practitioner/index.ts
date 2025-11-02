import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface FindPractitionerRequest {
  patientLat: number;
  patientLon: number;
  specialty: string;
  appointmentDate: string;
  appointmentTime: string;
  maxRadius?: number;
}

interface Practitioner {
  id: string;
  user_id: string;
  name: string;
  specialty: string;
  phone: string;
  latitude: number;
  longitude: number;
  available: boolean;
  can_accept_missions: boolean;
  intervention_radius: number;
}

interface AvailabilitySlot {
  id: string;
  practitioner_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface Exception {
  id: string;
  practitioner_id: string;
  date: string;
  is_available: boolean;
}

// Calcule la distance entre deux points GPS
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Rayon de la Terre en km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Vérifie si un praticien est disponible à une date et heure données
function isPractitionerAvailable(
  practitioner: Practitioner,
  appointmentDate: string,
  appointmentTime: string,
  availability: AvailabilitySlot[],
  exceptions: Exception[]
): boolean {
  const date = new Date(appointmentDate);
  const dayOfWeek = date.getDay();
  
  // Vérifier les exceptions (jours spéciaux)
  const exception = exceptions.find(e => 
    e.practitioner_id === practitioner.id && 
    e.date === appointmentDate
  );
  
  if (exception) {
    return exception.is_available;
  }
  
  // Vérifier la disponibilité normale
  const dayAvailability = availability.filter(a =>
    a.practitioner_id === practitioner.id &&
    a.day_of_week === dayOfWeek &&
    a.is_active
  );
  
  if (dayAvailability.length === 0) {
    return false;
  }
  
  // Vérifier si l'heure demandée est dans un créneau disponible
  for (const slot of dayAvailability) {
    if (appointmentTime >= slot.start_time && appointmentTime <= slot.end_time) {
      return true;
    }
  }
  
  return false;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authentification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header manquant');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Utilisateur non authentifié');
    }

    const requestData: FindPractitionerRequest = await req.json();
    const {
      patientLat,
      patientLon,
      specialty,
      appointmentDate,
      appointmentTime,
      maxRadius = 10, // 10 km par défaut
    } = requestData;

    console.log('🔍 Recherche de praticien:', {
      patientLat,
      patientLon,
      specialty,
      appointmentDate,
      appointmentTime,
      maxRadius,
    });

    // Récupérer tous les praticiens actifs de la spécialité demandée
    const { data: practitioners, error: practitionersError } = await supabase
      .from('practitioners')
      .select('*')
      .eq('specialty', specialty)
      .eq('available', true)
      .eq('can_accept_missions', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);
    
    console.log(`📊 ${practitioners?.length || 0} praticien(s) trouvé(s) avec la spécialité "${specialty}"`);

    if (practitionersError) {
      throw practitionersError;
    }

    if (!practitioners || practitioners.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Aucun praticien disponible trouvé pour la spécialité "${specialty}"`,
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Filtrer les praticiens dans le rayon de 5 km
    const nearbyPractitioners = practitioners
      .map(p => ({
        ...p,
        distance: calculateDistance(patientLat, patientLon, Number(p.latitude), Number(p.longitude)),
      }))
      .filter(p => p.distance <= maxRadius)
      .sort((a, b) => a.distance - b.distance);

    console.log(`📍 ${nearbyPractitioners.length} praticien(s) trouvé(s) dans un rayon de ${maxRadius} km`);

    if (nearbyPractitioners.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Aucun praticien trouvé dans un rayon de ${maxRadius} km`,
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Récupérer les disponibilités de tous les praticiens proches
    const practitionerIds = nearbyPractitioners.map(p => p.id);
    
    const { data: availability, error: availabilityError } = await supabase
      .from('practitioner_availability')
      .select('*')
      .in('practitioner_id', practitionerIds);

    if (availabilityError) {
      throw availabilityError;
    }

    // Récupérer les exceptions pour la date demandée
    const { data: exceptions, error: exceptionsError } = await supabase
      .from('practitioner_exceptions')
      .select('*')
      .in('practitioner_id', practitionerIds)
      .eq('date', appointmentDate);

    if (exceptionsError) {
      throw exceptionsError;
    }

    console.log(`📅 Vérification de la disponibilité pour le ${appointmentDate} à ${appointmentTime}`);

    // Trouver le premier praticien disponible
    for (const practitioner of nearbyPractitioners) {
      const isAvailable = isPractitionerAvailable(
        practitioner,
        appointmentDate,
        appointmentTime,
        availability || [],
        exceptions || []
      );

      console.log(`🔍 ${practitioner.name}: ${isAvailable ? '✅ Disponible' : '❌ Non disponible'}`);

      if (isAvailable) {
        console.log(`✅ Praticien trouvé: ${practitioner.name} à ${practitioner.distance.toFixed(2)} km`);
        
        return new Response(
          JSON.stringify({
            success: true,
            practitioner: {
              id: practitioner.id,
              user_id: practitioner.user_id,
              name: practitioner.name,
              specialty: practitioner.specialty,
              phone: practitioner.phone,
              distance: practitioner.distance,
            },
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Aucun praticien disponible trouvé
    console.log('❌ Aucun praticien disponible à cette date/heure');
    
    return new Response(
      JSON.stringify({
        success: false,
        message: `Aucun praticien disponible le ${new Date(appointmentDate).toLocaleDateString('fr-FR')} à ${appointmentTime}. Veuillez choisir une autre date ou heure.`,
        nearbyCount: nearbyPractitioners.length,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Erreur:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Erreur interne du serveur',
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
