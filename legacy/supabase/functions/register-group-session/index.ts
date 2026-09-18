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

// ✅ CORRECTION P0 #4: Timeout pour les appels edge functions
const PAYMENT_TIMEOUT_MS = 60000; // 60 secondes (FedaPay peut être lent)

async function invokeWithTimeout<T>(
  supabase: any,
  functionName: string,
  options: { body: any },
  timeoutMs: number = PAYMENT_TIMEOUT_MS
): Promise<{ data: T | null; error: Error | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { data, error };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { data: null, error: new Error('Timeout: le service de paiement ne répond pas. Veuillez réessayer.') };
    }
    return { data: null, error: err };
  }
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

    // Validation des champs requis
    if (!body.sessionId || !body.patientId || !body.amount || !body.phoneNumber) {
      throw new Error('Données manquantes: sessionId, patientId, amount et phoneNumber requis');
    }

    // ✅ CORRECTION P1 #9: Validation du montant (aligné avec frontend session-validation.ts)
    const MIN_SESSION_PRICE = 5000;  // Prix minimum en FCFA
    const MAX_SESSION_PRICE = 500000; // Prix maximum en FCFA

    if (typeof body.amount !== 'number' || body.amount < MIN_SESSION_PRICE) {
      throw new Error(`Le montant doit être supérieur ou égal à ${MIN_SESSION_PRICE.toLocaleString()} FCFA`);
    }

    if (body.amount > MAX_SESSION_PRICE) {
      throw new Error(`Le montant ne peut pas dépasser ${MAX_SESSION_PRICE.toLocaleString()} FCFA`);
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

    // ✅ CORRECTION P0 #1 & #2: Récupérer les infos complètes de la séance incluant le coach
    const { data: sessionInfo, error: sessionError } = await supabase
      .from('group_sessions')
      .select(`
        id,
        session_name,
        scheduled_date,
        start_time,
        status,
        max_participants,
        current_participants,
        price_per_person,
        coach_id,
        coach:practitioners!inner(
          id,
          name,
          user_id,
          kyc_status,
          kyc_validated_at
        )
      `)
      .eq('id', body.sessionId)
      .single();

    if (sessionError || !sessionInfo) {
      console.error('❌ Séance non trouvée:', sessionError);
      throw new Error('Séance non trouvée');
    }

    const coach = Array.isArray(sessionInfo.coach) ? sessionInfo.coach[0] : sessionInfo.coach;

    // ✅ CORRECTION P0 #1: Vérifier le KYC du coach
    if (!coach || coach.kyc_status !== 'approved') {
      console.error('❌ Coach non vérifié:', coach?.kyc_status);
      throw new Error('Le coach n\'est pas encore vérifié. L\'inscription n\'est pas possible.');
    }

    if (!coach.kyc_validated_at) {
      console.error('❌ Coach KYC non validé (date manquante)');
      throw new Error('Le coach n\'a pas encore terminé sa vérification.');
    }

    // ✅ CORRECTION P0 #2: Vérifier que la séance n'est pas passée
    const sessionDateTime = new Date(sessionInfo.scheduled_date + 'T' + sessionInfo.start_time);
    const now = new Date();
    
    if (sessionDateTime < now) {
      console.error('❌ Séance passée:', sessionDateTime.toISOString());
      throw new Error('Cette séance est déjà passée. Vous ne pouvez plus vous inscrire.');
    }

    // Vérifier le statut de la séance
    if (sessionInfo.status === 'annulee') {
      throw new Error('Cette séance a été annulée.');
    }

    if (sessionInfo.status === 'terminee') {
      throw new Error('Cette séance est terminée.');
    }

    // Vérification atomique de la disponibilité avec verrouillage optimiste
    const { data: reservation, error: reserveError } = await supabase
      .rpc('reserve_group_session_spot', {
        p_session_id: body.sessionId,
        p_patient_id: body.patientId
      });

    if (reserveError) {
      console.error('❌ Erreur réservation:', reserveError);
      throw new Error('Erreur lors de la vérification de disponibilité');
    }

    if (!reservation?.spot_reserved) {
      throw new Error(reservation?.error_message || 'Impossible de réserver cette place');
    }

    const session = reservation.session;
    console.log('✅ Place réservée atomiquement pour la séance:', session.id);

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

      // ✅ CORRECTION P0 #4: Appel avec timeout
      const { data: payment, error: paymentError } = await invokeWithTimeout(
        supabase,
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
        // ✅ CORRECTION P0 #3: Rollback complet - supprimer la participation
        // Le trigger update_session_participants_count se chargera de décrémenter current_participants
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
        // ✅ CORRECTION P0 #3: Rollback complet
        await supabase
          .from('group_session_participants')
          .delete()
          .eq('id', participantId);
        
        console.log('🔄 Rollback effectué: paiement invalide');
        throw new Error('Paiement créé mais invalide');
      }

      // 3. Récupérer les infos du coach pour notifications
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      // ✅ CORRECTION P1 #12: Notifications non-bloquantes
      if (coach?.user_id) {
        try {
          await dispatchNotification({
            supabase,
            supabaseUrl,
            serviceRoleKey,
            userId: coach.user_id,
            title: '🏋️ Nouvelle inscription',
            message: `${patientProfile?.full_name || 'Un participant'} s'est inscrit à votre séance "${session.session_name}"`,
            type: 'appointment',
            link: '/dashboard/coach?tab=sessions',
            channels: ['email', 'sms', 'push'],
          });
        } catch (notifError) {
          console.error('⚠️ Erreur notification coach (non bloquante):', notifError);
        }
      }

      try {
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
      } catch (notifError) {
        console.error('⚠️ Erreur notification patient (non bloquante):', notifError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          participantId,
          paymentId: paymentResult.paymentId,
          transactionId: paymentResult.transactionId,
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
