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
  paymentMethod: string;
  phoneNumber: string;
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
    
    console.log('🚀 Création atomique RDV + Paiement:', {
      patient: body.patientId,
      practitioner: body.practitionerId,
      amount: body.amount
    });

    // Validation des données
    if (!body.patientId || !body.practitionerId || !body.amount || !body.phoneNumber) {
      throw new Error('Données manquantes: patientId, practitionerId, amount et phoneNumber requis');
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

    // Vérifier que ce n'est pas un dimanche
    if (appointmentDate.getDay() === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Date invalide',
          details: ['Les rendez-vous ne sont pas disponibles le dimanche']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Transaction atomique via RPC ou séquence contrôlée
    let appointmentId: string | undefined;
    let paymentResult: any;

    try {
      // 1. Créer le rendez-vous
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
          status: 'pending_payment',
        })
        .select('id')
        .single();

      if (appointmentError) {
        console.error('❌ Erreur création RDV:', appointmentError);
        throw appointmentError;
      }

      appointmentId = appointment.id;
      console.log('✅ RDV créé:', appointmentId);

      // 2. Créer le paiement via l'edge function dédiée
      const { data: payment, error: paymentError } = await supabase.functions.invoke(
        'create-payment',
        {
          body: {
            appointmentId: appointmentId,
            amount: body.amount,
            paymentMethod: body.paymentMethod,
            phoneNumber: body.phoneNumber,
          }
        }
      );

      if (paymentError) {
        console.error('❌ Erreur création paiement:', paymentError);
        // Rollback: supprimer le RDV créé
        await supabase
          .from('appointments')
          .delete()
          .eq('id', appointmentId);
        
        console.log('🔄 Rollback effectué: RDV supprimé');
        throw new Error(`Échec paiement: ${paymentError.message}`);
      }

      paymentResult = payment;
      console.log('✅ Paiement créé:', paymentResult.paymentId);

      // 3. Vérifier que le paiement a bien été créé
      if (!paymentResult.success || !paymentResult.paymentId) {
        // Rollback: supprimer le RDV
        await supabase
          .from('appointments')
          .delete()
          .eq('id', appointmentId);
        
        console.log('🔄 Rollback effectué: paiement invalide');
        throw new Error('Paiement créé mais invalide');
      }

      console.log('✅ Transaction atomique réussie');

      // 4. Récupérer le user_id et practitioner_type du praticien
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

      // 5. Envoyer une notification au praticien
      if (practitionerUserId) {
        try {
          await dispatchNotification({
            supabase,
            supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
            serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            userId: practitionerUserId,
            title: '🩺 Nouvelle demande de rendez-vous',
            message: `${body.patientName} souhaite prendre rendez-vous le ${formattedDate} à ${body.time}. Raison: ${body.reason}`,
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

      // 6. Envoyer une notification de confirmation au patient
      try {
        await dispatchNotification({
          supabase,
          supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
          serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          userId: body.patientId,
          title: '✅ Demande de rendez-vous envoyée',
          message: `Votre demande de rendez-vous avec ${body.practitionerName} pour le ${formattedDate} à ${body.time} a été envoyée. Le praticien répondra généralement sous 30 minutes.`,
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
          paymentId: paymentResult.paymentId,
          paymentUrl: paymentResult.paymentUrl,
          transactionId: paymentResult.transactionId,
          status: paymentResult.status,
          expiresAt: paymentResult.expiresAt,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } catch (error: any) {
      console.error('❌ Erreur transaction:', error);
      
      // ✅ CORRECTION ERREUR #6: Variable undefined corrigée
      if (appointmentId) {
        try {
          await supabase
            .from('appointments')
            .delete()
            .eq('id', appointmentId);
          console.log('🔄 Rollback automatique effectué');
        } catch (rollbackError) {
          console.error('❌ Erreur rollback:', rollbackError);
        }
      }
      
      throw error;
    }

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
