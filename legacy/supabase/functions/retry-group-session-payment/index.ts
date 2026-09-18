import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetryPaymentRequest {
  participantId: string;
  paymentMethod: string;
  phoneNumber: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RetryPaymentRequest = await req.json();
    
    console.log('🔄 Retry paiement séance groupe:', {
      participantId: body.participantId,
      paymentMethod: body.paymentMethod
    });

    // Validation
    if (!body.participantId || !body.paymentMethod || !body.phoneNumber) {
      throw new Error('Données manquantes: participantId, paymentMethod et phoneNumber requis');
    }

    // 1. Récupérer la participation existante avec la séance
    const { data: participant, error: participantError } = await supabase
      .from('group_session_participants')
      .select(`
        id,
        session_id,
        patient_id,
        payment_status,
        session:group_sessions!inner(
          id,
          session_name,
          price_per_person,
          scheduled_date,
          start_time,
          status,
          coach_id,
          max_participants,
          current_participants,
          coach:practitioners!inner(
            id,
            name,
            user_id,
            kyc_status,
            kyc_validated_at
          )
        )
      `)
      .eq('id', body.participantId)
      .single();

    if (participantError || !participant) {
      console.error('❌ Participation non trouvée:', participantError);
      throw new Error('Inscription non trouvée');
    }

    const session = Array.isArray(participant.session) ? participant.session[0] : participant.session;

    // 2. Vérifications de sécurité
    // Vérifier que la séance n'est pas passée
    const sessionDate = new Date(session.scheduled_date + 'T' + session.start_time);
    if (sessionDate < new Date()) {
      throw new Error('Cette séance est déjà passée');
    }

    // Vérifier que la séance n'est pas annulée
    if (session.status === 'annulee') {
      throw new Error('Cette séance a été annulée');
    }

    // Vérifier le statut de paiement
    if (participant.payment_status === 'paid' || participant.payment_status === 'confirmed') {
      throw new Error('Cette inscription est déjà payée');
    }

    if (participant.payment_status === 'cancelled') {
      throw new Error('Cette inscription a été annulée');
    }

    // Vérifier le KYC du coach
    const coach = Array.isArray(session.coach) ? session.coach[0] : session.coach;
    if (!coach || coach.kyc_status !== 'approved' || !coach.kyc_validated_at) {
      throw new Error('Le coach n\'est pas encore vérifié. Veuillez réessayer plus tard.');
    }

    // 3. Récupérer les informations du patient
    const { data: patientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', participant.patient_id)
      .single();

    if (profileError || !patientProfile) {
      throw new Error('Profil patient non trouvé');
    }

    const { data: { user: patientUser }, error: userError } = await supabase.auth.admin.getUserById(participant.patient_id);
    
    if (userError || !patientUser) {
      throw new Error('Utilisateur non trouvé');
    }

    // 4. Vérifier s'il y a un paiement existant en pending pour cette participation
    const appointmentId = `group_session_${session.id}_${participant.id}`;
    
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id, status, fedapay_transaction_id')
      .eq('appointment_id', appointmentId)
      .eq('status', 'pending')
      .maybeSingle();

    let paymentResult: any;

    if (existingPayment?.fedapay_transaction_id) {
      // Réutiliser la transaction existante
      console.log('🔄 Réutilisation transaction existante:', existingPayment.fedapay_transaction_id);
      
      paymentResult = {
        success: true,
        paymentId: existingPayment.id,
        transactionId: existingPayment.fedapay_transaction_id
      };
    } else {
      // Créer un nouveau paiement
      console.log('💳 Création nouveau paiement pour retry');
      
      const { data: payment, error: paymentError } = await supabase.functions.invoke(
        'create-payment',
        {
          body: {
            appointmentId,
            amount: session.price_per_person,
            paymentMethod: body.paymentMethod,
            phoneNumber: body.phoneNumber,
            payerName: patientProfile.full_name || 'Patient',
            payerEmail: patientUser.email || `patient-${participant.patient_id}@domicares.app`,
            bypassAuth: true,
            patientId: participant.patient_id
          }
        }
      );

      if (paymentError) {
        console.error('❌ Erreur création paiement:', paymentError);
        throw new Error(`Échec paiement: ${paymentError.message}`);
      }

      if (!payment?.success || !payment?.transactionId) {
        throw new Error('Paiement créé mais invalide');
      }

      paymentResult = payment;
    }

    console.log('✅ Paiement prêt:', paymentResult.transactionId);

    return new Response(
      JSON.stringify({
        success: true,
        participantId: participant.id,
        transactionId: paymentResult.transactionId,
        paymentUrl: paymentResult.paymentUrl,
        message: 'Paiement prêt. Veuillez compléter le paiement.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('❌ Erreur retry paiement:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur lors du retry paiement'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
