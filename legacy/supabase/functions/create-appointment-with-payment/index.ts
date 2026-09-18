import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { dispatchNotification } from '../_shared/notifications.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateAppointmentRequest {
  patientId: string;
  patientName: string;
  practitionerId: string;
  practitionerName: string;
  specialty: string;
  date: string;
  time: string;
  duration: number;
  address: string;
  reason: string;
  urgencyLevel?: string;
  amount: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: CreateAppointmentRequest = await req.json();
    
    console.log('🚀 Création de demande de RDV:', {
      patient: body.patientId,
      practitioner: body.practitionerId,
      amount: body.amount
    });

    // Validation des données
    if (!body.patientId || !body.practitionerId || !body.amount) {
      throw new Error('Données manquantes: patientId, practitionerId et amount requis');
    }

    // Validation date/heure
    const appointmentDate = new Date(body.date);
    const now = new Date();

    // Vérifier que la date n'est pas dans le passé
    if (appointmentDate < now) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Date invalide',
          details: ['La date du rendez-vous ne peut pas être dans le passé']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Note: Le dimanche n'est plus bloqué systématiquement
    // Les praticiens peuvent définir leur disponibilité le dimanche

    // Valider le format de l'heure (HH:MM)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(body.time)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Heure invalide',
          details: ['Le format de l\'heure doit être HH:MM (ex: 14:30)']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier que l'heure n'est pas passée si c'est aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appointmentDay = new Date(appointmentDate);
    appointmentDay.setHours(0, 0, 0, 0);

    if (appointmentDay.getTime() === today.getTime()) {
      const [hours, minutes] = body.time.split(':').map(Number);
      const appointmentTime = new Date();
      appointmentTime.setHours(hours, minutes, 0, 0);

      if (appointmentTime < new Date()) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Heure invalide',
            details: ['L\'heure du rendez-vous est déjà passée. Veuillez choisir un créneau ultérieur.']
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 1. Créer le rendez-vous avec statut "awaiting_practitioner"
    // Le paiement sera créé APRÈS que le praticien accepte
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert({
        patient_id: body.patientId,
        patient_name: body.patientName,
        practitioner_id: body.practitionerId,
        practitioner_name: body.practitionerName,
        specialty: body.specialty,
        date: body.date,
        time: body.time,
        duration: body.duration,
        address: body.address,
        reason: body.reason,
        urgency_level: body.urgencyLevel || 'non-urgent',
        status: 'awaiting_practitioner', // En attente de réponse du praticien
        payment_amount: body.amount, // Stocker le montant pour utilisation lors du paiement
      })
      .select('id')
      .single();

    if (appointmentError) {
      console.error('❌ Erreur création RDV:', appointmentError);
      throw appointmentError;
    }

    const appointmentId = appointment.id;
    console.log('✅ RDV créé avec statut awaiting_practitioner:', appointmentId);

    // 2. Récupérer le user_id et practitioner_type du praticien
    const { data: practitionerData, error: practitionerError } = await supabase
      .from('practitioners')
      .select('user_id, practitioner_type')
      .eq('id', body.practitionerId)
      .single();

    if (practitionerError || !practitionerData?.user_id) {
      console.error('❌ Praticien non trouvé pour notifications:', practitionerError);
      // Non-bloquant: on continue sans notifier le praticien
    }

    const practitionerUserId = practitionerData?.user_id;
    const dashboardLink = practitionerData?.practitioner_type === 'coach_sportif' 
      ? '/dashboard/coach' 
      : '/dashboard/practitioner';

    // Helper pour formater la date correctement (YYYY-MM-DD -> date locale)
    const formatDateForDisplay = (dateStr: string): string => {
      const [year, month, day] = dateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      return dateObj.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
      });
    };
    
    const formattedDate = formatDateForDisplay(body.date);

    // 3. Envoyer une notification au praticien pour qu'il accepte ou refuse
    if (practitionerUserId) {
      try {
        await dispatchNotification({
          supabase,
          supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
          serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          userId: practitionerUserId,
          title: '🩺 Nouvelle demande de rendez-vous',
          message: `${body.patientName} souhaite prendre rendez-vous le ${formattedDate} à ${body.time}. Raison: ${body.reason}. Montant: ${body.amount} XOF. Connectez-vous pour accepter ou refuser.`,
          type: 'appointment',
          link: dashboardLink,
          channels: ['email', 'sms', 'push'],
        });
        console.log('✅ Notification envoyée au praticien');
      } catch (notifError) {
        console.error('⚠️ Erreur notification praticien (non bloquant):', notifError);
      }
    } else {
      console.log('⚠️ Notification praticien ignorée (practitionerUserId absent)');
    }

    // 4. Envoyer une notification de confirmation au patient
    try {
      await dispatchNotification({
        supabase,
        supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        userId: body.patientId,
        title: '📋 Demande de rendez-vous envoyée',
        message: `Votre demande de rendez-vous avec ${body.practitionerName} pour le ${formattedDate} à ${body.time} a été envoyée. Le praticien doit d'abord accepter votre demande, puis vous serez invité à payer pour confirmer le rendez-vous.`,
        type: 'appointment',
        link: '/dashboard/patient',
        channels: ['email', 'push'],
      });
      console.log('✅ Notification de confirmation envoyée au patient');
    } catch (notifError) {
      console.error('⚠️ Erreur notification patient (non bloquant):', notifError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        appointmentId,
        status: 'awaiting_practitioner',
        message: 'Demande de rendez-vous créée. En attente de réponse du praticien.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ Erreur globale:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur lors de la création du rendez-vous',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
