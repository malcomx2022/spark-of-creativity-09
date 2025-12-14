import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { dispatchNotification } from '../_shared/notifications.ts';

const DEFAULT_APPOINTMENT_AMOUNT = 10000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FindPractitionerRequest {
  patientLat: number;
  patientLon: number;
  specialty: string;
  appointmentDate: string;
  appointmentTime: string;
  maxRadius: number;
}

interface Practitioner {
  id: string;
  user_id: string;
  name: string;
  specialty: string;
  latitude: number;
  longitude: number;
  distance: number;
}

interface AvailabilitySlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface Exception {
  date: string;
  is_available: boolean;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isPractitionerAvailable(
  practitioner: Practitioner,
  appointmentDate: string,
  appointmentTime: string,
  availability: AvailabilitySlot[],
  exceptions: Exception[]
): boolean {
  const date = new Date(appointmentDate);
  const dayOfWeek = date.getDay();
  
  const exception = exceptions.find(e => e.date === appointmentDate);
  if (exception) {
    return exception.is_available;
  }
  
  const availableSlots = availability.filter(slot => slot.day_of_week === dayOfWeek);
  if (availableSlots.length === 0) {
    return false;
  }
  
  return availableSlots.some(slot => {
    return appointmentTime >= slot.start_time && appointmentTime < slot.end_time;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Autorisation requise');
    }

    const { appointmentId, action } = await req.json();

    if (!appointmentId || !action) {
      throw new Error('appointmentId et action sont requis');
    }

    console.log(`📋 Traitement de l'action ${action} pour le rendez-vous ${appointmentId}`);

    // Récupérer le rendez-vous
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new Error('Rendez-vous introuvable');
    }

    if (action === 'accept') {
      // Vérifier que le RDV est toujours en attente (protection race condition)
      if (appointment.status !== 'awaiting_practitioner') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Ce rendez-vous a déjà été traité',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          }
        );
      }

      // Le praticien accepte → passer en statut "confirmed" (en attente de paiement)
      // Utiliser le statut actuel comme condition pour éviter race condition
      let paymentAmount = appointment.payment_amount ?? null;

      if (paymentAmount === null) {
        const { data: rate } = await supabase
          .from('practitioner_rates')
          .select('base_price')
          .eq('practitioner_id', appointment.practitioner_id)
          .eq('service_type', appointment.specialty)
          .maybeSingle();

        paymentAmount = rate?.base_price ?? null;

        if (paymentAmount === null) {
          const { data: service } = await supabase
            .from('services')
            .select('base_price')
            .eq('name', appointment.specialty)
            .maybeSingle();

          paymentAmount = service?.base_price ?? DEFAULT_APPOINTMENT_AMOUNT;
        }
      }

      // ✅ Récupérer le numéro de téléphone et le nom du patient
      const { data: patientProfile } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('id', appointment.patient_id)
        .single();

      if (!patientProfile?.phone) {
        throw new Error('Le patient n\'a pas de numéro de téléphone enregistré');
      }
      
      // Utiliser le nom du profile si disponible, sinon celui du rendez-vous
      const patientName = patientProfile.full_name || appointment.patient_name || 'Patient';

      // ✅ Mettre à jour le statut du rendez-vous en 'pending_payment' directement
      // Le statut passera à 'confirmed' uniquement quand le paiement sera complété (via webhook)
      console.log('📝 Mise à jour du rendez-vous en statut pending_payment');
      const { error: preUpdateError } = await supabase
        .from('appointments')
        .update({ 
          status: 'pending_payment', 
          payment_amount: paymentAmount
        })
        .eq('id', appointmentId)
        .eq('status', 'awaiting_practitioner'); // Lock optimiste

      if (preUpdateError) {
        console.error('❌ Erreur mise à jour pré-paiement:', preUpdateError);
        throw new Error('Impossible de mettre à jour le rendez-vous');
      }

      // ✅ Créer le paiement FedaPay avec service role
      console.log('💳 Création du paiement FedaPay pour', paymentAmount, 'XOF');
      
      // Créer un client Supabase avec service role pour appeler create-payment
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
      
      const { data: paymentData, error: paymentError } = await supabaseAdmin.functions.invoke(
        'create-payment',
        {
          body: {
            appointmentId: appointmentId,
            amount: paymentAmount,
            paymentMethod: 'mtn',
            phoneNumber: patientProfile.phone,
            payerName: patientName,
            // Indiquer qu'on crée le paiement pour le patient via service role
            bypassAuth: true,
            patientId: appointment.patient_id
          }
        }
      );

      if (paymentError || !paymentData?.success) {
        console.error('❌ Erreur création paiement:', paymentError);
        // Remettre le statut à awaiting_practitioner en cas d'erreur
        await supabase
          .from('appointments')
          .update({ status: 'awaiting_practitioner' })
          .eq('id', appointmentId);
        throw new Error('Impossible de créer le lien de paiement');
      }

      console.log('✅ Paiement créé:', paymentData.paymentId);

      // Mettre à jour seulement la date d'expiration (le statut est déjà pending_payment)
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ 
          payment_expires_at: paymentData.expiresAt 
        })
        .eq('id', appointmentId)
        .eq('status', 'pending_payment'); // Lock optimiste

      if (updateError) {
        console.error('❌ Erreur mise à jour post-paiement:', updateError);
      }

      // Créer une notification avec le lien de paiement pour le patient
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      await dispatchNotification({
        supabase,
        supabaseUrl,
        serviceRoleKey,
        userId: appointment.patient_id,
        title: '💳 Paiement requis - Rendez-vous confirmé',
        message: `${appointment.practitioner_name} a accepté votre rendez-vous le ${appointment.date} à ${appointment.time}. Payez ${paymentAmount} XOF pour finaliser.`,
        type: 'payment_required',
        link: paymentData.paymentUrl,
        channels: ['email', 'sms', 'push'],
      });

      console.log('✅ Rendez-vous confirmé, paiement créé et notification envoyée');

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Rendez-vous confirmé, paiement créé',
          paymentUrl: paymentData.paymentUrl,
          paymentId: paymentData.paymentId
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'reject') {
      console.log('🔍 Recherche d\'un praticien alternatif...');

      // Variables pour dispatchNotification
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      // Marquer le rendez-vous comme rejeté temporairement
      await supabase
        .from('appointments')
        .update({ status: 'rejected' })
        .eq('id', appointmentId);

      // Récupérer l'adresse du patient pour la géolocalisation
      const { data: patientAddress } = await supabase
        .from('addresses')
        .select('latitude, longitude')
        .eq('user_id', appointment.patient_id)
        .eq('is_default', true)
        .single();

      if (!patientAddress?.latitude || !patientAddress?.longitude) {
        // Pas de localisation → notifier le patient
        await dispatchNotification({
          supabase,
          supabaseUrl,
          serviceRoleKey,
          userId: appointment.patient_id,
          title: '❌ Rendez-vous refusé',
          message: 'Le praticien a refusé votre rendez-vous. Aucun praticien alternatif trouvé. Veuillez réessayer.',
          type: 'appointment',
          link: '/dashboard/patient',
          channels: ['email', 'sms', 'push'],
        });

        return new Response(
          JSON.stringify({ success: true, message: 'Rendez-vous refusé, aucun praticien alternatif' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Chercher un autre praticien disponible
      const findRequest: FindPractitionerRequest = {
        patientLat: patientAddress.latitude,
        patientLon: patientAddress.longitude,
        specialty: appointment.specialty,
        appointmentDate: appointment.date,
        appointmentTime: appointment.time,
        maxRadius: 100,
      };

      const { data: practitioners } = await supabase
        .from('practitioners')
        .select('*')
        .eq('specialty', findRequest.specialty)
        .eq('available', true)
        .neq('user_id', appointment.practitioner_id); // Exclure le praticien qui a refusé

      if (!practitioners || practitioners.length === 0) {
        // Aucun praticien alternatif → notifier le patient
        await dispatchNotification({
          supabase,
          supabaseUrl,
          serviceRoleKey,
          userId: appointment.patient_id,
          title: '❌ Rendez-vous refusé',
          message: 'Le praticien a refusé votre rendez-vous. Aucun praticien alternatif disponible. Veuillez réessayer.',
          type: 'appointment',
          link: '/dashboard/patient',
          channels: ['email', 'sms', 'push'],
        });

        console.log('❌ Aucun praticien alternatif trouvé');

        return new Response(
          JSON.stringify({ success: true, message: 'Aucun praticien alternatif trouvé' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculer les distances et filtrer
      const nearbyPractitioners: Practitioner[] = practitioners
        .map(p => ({
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          specialty: p.specialty,
          latitude: p.latitude,
          longitude: p.longitude,
          distance: calculateDistance(
            findRequest.patientLat,
            findRequest.patientLon,
            p.latitude,
            p.longitude
          ),
        }))
        .filter(p => p.distance <= findRequest.maxRadius)
        .sort((a, b) => a.distance - b.distance);

      if (nearbyPractitioners.length === 0) {
        await dispatchNotification({
          supabase,
          supabaseUrl,
          serviceRoleKey,
          userId: appointment.patient_id,
          title: '❌ Rendez-vous refusé',
          message: 'Le praticien a refusé votre rendez-vous. Aucun praticien alternatif dans la zone. Veuillez réessayer.',
          type: 'appointment',
          link: '/dashboard/patient',
          channels: ['email', 'sms', 'push'],
        });

        console.log('❌ Aucun praticien dans la zone');

        return new Response(
          JSON.stringify({ success: true, message: 'Aucun praticien dans la zone' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Récupérer les disponibilités et exceptions
      const practitionerIds = nearbyPractitioners.map(p => p.id);
      
      const { data: allAvailability } = await supabase
        .from('practitioner_availability')
        .select('*')
        .in('practitioner_id', practitionerIds)
        .eq('is_active', true);

      const { data: allExceptions } = await supabase
        .from('practitioner_exceptions')
        .select('*')
        .in('practitioner_id', practitionerIds);

      // Trouver le premier praticien disponible
      for (const prac of nearbyPractitioners) {
        const availability = allAvailability?.filter(a => a.practitioner_id === prac.id) || [];
        const exceptions = allExceptions?.filter(e => e.practitioner_id === prac.id) || [];

        if (isPractitionerAvailable(prac, findRequest.appointmentDate, findRequest.appointmentTime, availability, exceptions)) {
          // Réassigner le rendez-vous au nouveau praticien
          const { error: reassignError } = await supabase
            .from('appointments')
            .update({
              practitioner_id: prac.user_id,
              practitioner_name: prac.name,
              status: 'awaiting_practitioner',
            })
            .eq('id', appointmentId);

          if (reassignError) throw reassignError;

          // Notifier le nouveau praticien avec SMS
          await dispatchNotification({
            supabase,
            supabaseUrl,
            serviceRoleKey,
            userId: prac.user_id,
            title: '🩺 Nouvelle demande de rendez-vous',
            message: `${appointment.patient_name} souhaite un rendez-vous le ${appointment.date} à ${appointment.time}.`,
            type: 'appointment',
            link: '/dashboard/practitioner',
            channels: ['email', 'sms', 'push'],
          });

          // Notifier le patient avec SMS
          await dispatchNotification({
            supabase,
            supabaseUrl,
            serviceRoleKey,
            userId: appointment.patient_id,
            title: '🔄 Nouveau praticien assigné',
            message: `Un nouveau praticien (${prac.name}) a été assigné à votre demande.`,
            type: 'appointment',
            link: '/dashboard/patient',
            channels: ['email', 'sms', 'push'],
          });

          console.log(`✅ Rendez-vous réassigné à ${prac.name}`);

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Rendez-vous réassigné à un nouveau praticien',
              practitioner: prac 
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Aucun praticien alternatif disponible
      await dispatchNotification({
        supabase,
        supabaseUrl,
        serviceRoleKey,
        userId: appointment.patient_id,
        title: '❌ Rendez-vous refusé',
        message: 'Le praticien a refusé votre rendez-vous. Aucun praticien alternatif disponible à cette date. Veuillez choisir une autre date.',
        type: 'appointment',
        link: '/dashboard/patient',
        channels: ['email', 'sms', 'push'],
      });

      console.log('❌ Aucun praticien alternatif disponible');

      return new Response(
        JSON.stringify({ success: true, message: 'Aucun praticien alternatif disponible' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Action invalide');

  } catch (error) {
    console.error('❌ Erreur:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
