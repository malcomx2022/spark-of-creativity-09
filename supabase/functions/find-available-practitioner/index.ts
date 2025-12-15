import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface FindPractitionerRequest {
  patientLat: number;
  patientLon: number;
  specialty: string; // Maintenant contient le practitioner_type (catégorie)
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

// Parse une date YYYY-MM-DD en jour de la semaine local (0=Dimanche, 6=Samedi)
function getDayOfWeekFromDateString(dateString: string): number {
  // Parse YYYY-MM-DD directement sans conversion UTC
  const parts = dateString.split('-');
  if (parts.length !== 3) {
    console.error('❌ Format de date invalide:', dateString);
    return -1;
  }
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Mois 0-indexé
  const day = parseInt(parts[2], 10);
  
  // Créer la date en utilisant les composants locaux
  const date = new Date(year, month, day);
  return date.getDay();
}

// Compare deux heures au format HH:MM
function compareTime(time1: string, time2: string): number {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  
  if (h1 !== h2) return h1 - h2;
  return m1 - m2;
}

// Vérifie si un praticien est disponible à une date et heure données
function isPractitionerAvailable(
  practitioner: Practitioner,
  appointmentDate: string,
  appointmentTime: string,
  availability: AvailabilitySlot[],
  exceptions: Exception[]
): boolean {
  // Obtenir le jour de la semaine depuis la chaîne de date (évite les problèmes UTC)
  const dayOfWeek = getDayOfWeekFromDateString(appointmentDate);
  
  if (dayOfWeek === -1) {
    console.error(`❌ Impossible de déterminer le jour pour ${appointmentDate}`);
    return false;
  }
  
  console.log(`📅 Date: ${appointmentDate}, Jour de la semaine: ${dayOfWeek} (0=Dim, 1=Lun, ..., 6=Sam)`);
  
  // Vérifier les exceptions (jours spéciaux)
  const exception = exceptions.find(e => 
    e.practitioner_id === practitioner.id && 
    e.date === appointmentDate
  );
  
  if (exception) {
    console.log(`⚠️ Exception trouvée pour ${practitioner.name}: ${exception.is_available ? 'Disponible' : 'Indisponible'}`);
    return exception.is_available;
  }
  
  // Vérifier la disponibilité normale
  const dayAvailability = availability.filter(a =>
    a.practitioner_id === practitioner.id &&
    a.day_of_week === dayOfWeek &&
    a.is_active !== false // Inclure si is_active est true ou null
  );
  
  console.log(`📊 ${practitioner.name}: ${dayAvailability.length} créneau(x) pour jour ${dayOfWeek}`);
  
  if (dayAvailability.length === 0) {
    console.log(`❌ ${practitioner.name}: Aucun créneau défini pour ce jour`);
    return false;
  }
  
  // Normaliser l'heure du rendez-vous (s'assurer du format HH:MM)
  const normalizedAppointmentTime = appointmentTime.substring(0, 5);
  
  // Vérifier si l'heure demandée est dans un créneau disponible
  for (const slot of dayAvailability) {
    // Normaliser les heures du créneau
    const slotStart = slot.start_time.substring(0, 5);
    const slotEnd = slot.end_time.substring(0, 5);
    
    console.log(`🕐 Vérification créneau: ${slotStart} - ${slotEnd} pour RDV à ${normalizedAppointmentTime}`);
    
    // L'heure doit être >= début ET < fin (pas <= car le RDV a une durée)
    if (compareTime(normalizedAppointmentTime, slotStart) >= 0 && 
        compareTime(normalizedAppointmentTime, slotEnd) < 0) {
      console.log(`✅ ${practitioner.name}: Créneau valide trouvé (${slotStart}-${slotEnd})`);
      return true;
    }
  }
  
  console.log(`❌ ${practitioner.name}: Aucun créneau ne correspond à ${normalizedAppointmentTime}`);
  return false;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestData: FindPractitionerRequest = await req.json();
    const {
      patientLat,
      patientLon,
      specialty,
      appointmentDate,
      appointmentTime,
      maxRadius = 100, // 100 km par défaut
    } = requestData;

    console.log('🔍 Recherche de praticien:', {
      patientLat,
      patientLon,
      specialty, // Contient maintenant practitioner_type (catégorie)
      appointmentDate,
      appointmentTime,
      maxRadius,
    });

    // Récupérer tous les praticiens actifs, validés KYC et autorisés à accepter des missions
    // On cherche par practitioner_type (catégorie) au lieu de specialty
    // ✅ CORRECTION P0 #3 & P1 #5: Vérifier kyc_status ET kyc_validated_at
    const { data: practitioners, error: practitionersError } = await supabase
      .from('practitioners')
      .select('*')
      .eq('practitioner_type', specialty)
      .eq('available', true)
      .eq('can_accept_missions', true)
      .eq('kyc_status', 'approved')
      .not('kyc_validated_at', 'is', null) // ✅ CORRECTION P1 #5: Exiger date de validation
      .eq('is_online', true)
      .not('latitude', 'is', null) // ✅ CORRECTION P1 #2: Exclure praticiens sans coordonnées GPS
      .not('longitude', 'is', null);
    
    console.log(`📊 ${practitioners?.length || 0} praticien(s) trouvé(s) pour la catégorie "${specialty}"`);

    if (practitionersError) {
      throw practitionersError;
    }

    if (!practitioners || practitioners.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Aucun praticien disponible trouvé pour la catégorie "${specialty}"`,
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
              // SECURITY: Phone number removed - only shared after appointment booking
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
        message: `${nearbyPractitioners.length} praticien(s) trouvé(s) à proximité, mais aucun n'est disponible le ${new Date(appointmentDate).toLocaleDateString('fr-FR')} à ${appointmentTime}. Les praticiens doivent configurer leurs créneaux de disponibilité. Veuillez choisir une autre date/heure ou contacter directement un praticien.`,
        nearbyCount: nearbyPractitioners.length,
        practitionersFound: nearbyPractitioners.map(p => ({
          name: p.name,
          distance: p.distance.toFixed(2)
        }))
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
