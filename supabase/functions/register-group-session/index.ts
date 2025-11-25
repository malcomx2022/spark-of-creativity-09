import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { dispatchNotification } from '../_shared/notifications.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegisterSessionRequest {
  sessionId: string;
  patientId: string;
  amount: number;
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

    const body: RegisterSessionRequest = await req.json();
    
    console.log('🏋️ Inscription séance groupe + Paiement:', {
      session: body.sessionId,
      patient: body.patientId,
      amount: body.amount
    });

    // Validation
    if (!body.sessionId || !body.patientId || !body.amount || !body.phoneNumber) {
      throw new Error('Données manquantes: sessionId, patientId, amount et phoneNumber requis');
    }

    // Récupérer les informations du patient pour le paiement
    const { data: patientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, id')
      .eq('id', body.patientId)
      .single();

    if (profileError || !patientProfile) {
      throw new Error('Profil patient non trouvé');
    }

    // Obtenir l'email du patient
    const { data: { user: patientUser }, error: userError } = await supabase.auth.admin.getUserById(body.patientId);
    
    if (userError || !patientUser) {
      throw new Error('Utilisateur non trouvé');
    }

    // Vérifier que la séance existe et a des places disponibles
    const { data: session, error: sessionError } = await supabase
      .from('group_sessions')
      .select('*')
      .eq('id', body.sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error('Séance non trouvée');
    }

    if (session.status !== 'planifiee' && session.status !== 'confirmee') {
      throw new Error('Séance non disponible pour inscription');
    }

    if (session.current_participants >= session.max_participants) {
      throw new Error('Séance complète');
    }

    // Vérifier si déjà inscrit
    const { data: existing } = await supabase
      .from('group_session_participants')
      .select('id')
      .eq('session_id', body.sessionId)
      .eq('patient_id', body.patientId)
      .single();

    if (existing) {
      throw new Error('Déjà inscrit à cette séance');
    }

    let participantId: string | undefined;
    let paymentResult: any;

    try {
      // 1. Créer la participation avec payment_status pending
      const { data: participant, error: participantError } = await supabase
        .from('group_session_participants')
        .insert({
          session_id: body.sessionId,
          patient_id: body.patientId,
          payment_status: 'pending'
        })
        .select('id')
        .single();

      if (participantError) {
        console.error('❌ Erreur création participation:', participantError);
        throw participantError;
      }

      participantId = participant.id;
      console.log('✅ Participation créée:', participantId);

      // 2. Créer le paiement en mode service role avec toutes les infos requises
      const { data: payment, error: paymentError } = await supabase.functions.invoke(
        'create-payment',
        {
          body: {
            appointmentId: `group_session_${body.sessionId}_${participantId}`,
            amount: body.amount,
            paymentMethod: body.paymentMethod,
            phoneNumber: body.phoneNumber,
            payerName: patientProfile.full_name || 'Patient',
            payerEmail: patientUser.email || `patient-${body.patientId}@domicares.app`,
            bypassAuth: true,
            patientId: body.patientId
          }
        }
      );

      if (paymentError) {
        console.error('❌ Erreur création paiement:', paymentError);
        // Rollback: supprimer la participation
        await supabase
          .from('group_session_participants')
          .delete()
          .eq('id', participantId);
        
        console.log('🔄 Rollback effectué: participation supprimée');
        throw new Error(`Échec paiement: ${paymentError.message}`);
      }

      paymentResult = payment;
      console.log('✅ Paiement créé:', paymentResult.paymentId);

      if (!paymentResult.success || !paymentResult.paymentId) {
        // Rollback
        await supabase
          .from('group_session_participants')
          .delete()
          .eq('id', participantId);
        
        console.log('🔄 Rollback effectué: paiement invalide');
        throw new Error('Paiement créé mais invalide');
      }

      // 3. Récupérer les infos du coach pour notifications
      const { data: coach } = await supabase
        .from('practitioners')
        .select('name, user_id')
        .eq('id', session.coach_id)
        .single();

      // 4. Notifications
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      if (coach?.user_id) {
        await dispatchNotification({
          supabase,
          supabaseUrl,
          serviceRoleKey,
          userId: coach.user_id,
          title: 'Nouvelle inscription',
          message: `${patientProfile?.full_name || 'Un participant'} s'est inscrit à votre séance "${session.session_name}"`,
          type: 'appointment'
        });
      }

      await dispatchNotification({
        supabase,
        supabaseUrl,
        serviceRoleKey,
        userId: body.patientId,
        title: 'Paiement en attente',
        message: `Veuillez confirmer le paiement pour valider votre inscription à "${session.session_name}"`,
        type: 'payment',
        link: paymentResult.paymentUrl
      });

      return new Response(
        JSON.stringify({
          success: true,
          participantId,
          paymentId: paymentResult.paymentId,
          paymentUrl: paymentResult.paymentUrl,
          message: 'Inscription créée avec succès. Veuillez procéder au paiement.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );

    } catch (error: any) {
      console.error('💥 Erreur transaction:', error);
      throw error;
    }

  } catch (error: any) {
    console.error('❌ Erreur globale:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur lors de l\'inscription'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
