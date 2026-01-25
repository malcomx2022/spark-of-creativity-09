import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Synchronise le statut d'un paiement avec FedaPay
 * Utilisé quand le webhook n'arrive pas (mode sandbox notamment)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { paymentId } = await req.json();
    
    if (!paymentId) {
      return new Response(
        JSON.stringify({ error: 'Payment ID requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Syncing payment status:', paymentId);

    // Récupérer le paiement
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'Paiement non trouvé' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Si pas de transaction FedaPay, on ne peut pas synchroniser
    if (!payment.fedapay_transaction_id) {
      return new Response(
        JSON.stringify({ 
          error: 'Pas de transaction FedaPay associée',
          payment: { id: payment.id, status: payment.status }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Appeler l'API FedaPay pour récupérer le statut
    const fedapayBaseUrl = fedapayMode === 'live' 
      ? 'https://api.fedapay.com/v1'
      : 'https://sandbox-api.fedapay.com/v1';

    const fedapayResponse = await fetch(
      `${fedapayBaseUrl}/transactions/${payment.fedapay_transaction_id}`,
      {
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!fedapayResponse.ok) {
      const errorText = await fedapayResponse.text();
      console.error('FedaPay API error:', fedapayResponse.status, errorText);
      throw new Error(`FedaPay API error: ${fedapayResponse.status}`);
    }

    const fedapayData = await fedapayResponse.json();
    console.log('FedaPay response:', JSON.stringify(fedapayData));
    
    // ✅ CORRECTION P2 #8: Harmoniser l'extraction avec create-payment
    // FedaPay peut utiliser v1_transaction, v1/transaction, ou transaction
    const transactionData = fedapayData.v1_transaction || fedapayData['v1/transaction'] || fedapayData.v1?.transaction || fedapayData.transaction || fedapayData;
    const fedapayStatus = transactionData?.status;
    
    if (!fedapayStatus) {
      console.error('Could not extract status from FedaPay response:', fedapayData);
      throw new Error('Invalid FedaPay response: status not found');
    }

    console.log('FedaPay status:', fedapayStatus);

    // Mapper le statut FedaPay
    const statusMap: Record<string, string> = {
      'pending': 'pending',
      'processing': 'pending',
      'approved': 'paid',
      'declined': 'failed',
      'canceled': 'canceled',
      'refunded': 'refunded',
    };

    const newStatus = statusMap[fedapayStatus] || payment.status;

    // Si le statut a changé, mettre à jour
    if (newStatus !== payment.status) {
      console.log(`Status changed from ${payment.status} to ${newStatus}`);

      // Déterminer le practitioner_id
      let practitionerId: string | null = null;
      
      if (payment.appointment_id && payment.appointment_id.startsWith('group_session_')) {
        const parts = payment.appointment_id.split('_');
        const sessionId = parts[2];
        
        const { data: sessionData } = await supabase
          .from('group_sessions')
          .select('coach_id')
          .eq('id', sessionId)
          .single();
        
        if (sessionData?.coach_id) {
          practitionerId = sessionData.coach_id;
        }
      } else {
        const { data: appointmentData } = await supabase
          .from('appointments')
          .select('practitioner_id')
          .eq('id', payment.appointment_id)
          .single();
        
        if (appointmentData?.practitioner_id) {
          practitionerId = appointmentData.practitioner_id;
        }
      }

      // Mettre à jour avec la fonction atomique si c'est un paiement réussi
      if (newStatus === 'paid' && practitionerId && payment.net_amount) {
        const holdPeriodDays = 2;
        const holdUntil = new Date();
        holdUntil.setDate(holdUntil.getDate() + holdPeriodDays);

        await supabase.rpc('update_payment_with_balance', {
          p_payment_id: payment.id,
          p_practitioner_id: practitionerId,
          p_net_amount: payment.net_amount,
          p_new_status: 'paid',
          p_new_payout_status: 'held',
          p_hold_until: holdUntil.toISOString()
        });

        // Mettre à jour l'appointment
        if (payment.appointment_id && !payment.appointment_id.startsWith('group_session_')) {
          await supabase
            .from('appointments')
            .update({ status: 'confirmed' })
            .eq('id', payment.appointment_id);
        } else if (payment.appointment_id && payment.appointment_id.startsWith('group_session_')) {
          const parts = payment.appointment_id.split('_');
          const participantId = parts[parts.length - 1];
          
          await supabase
            .from('group_session_participants')
            .update({ payment_status: 'paid' })
            .eq('id', participantId);
        }

        // Créer événement
        await supabase
          .from('payment_events')
          .insert({
            payment_id: payment.id,
            event_type: 'payment.intent.succeeded',
            event_data: {
              status: 'paid',
              fedapay_status: fedapayStatus,
              synced_manually: true
            }
          });
      } else {
        // Simple mise à jour du statut
        await supabase
          .from('payments')
          .update({ 
            status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', payment.id);
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          oldStatus: payment.status,
          newStatus,
          fedapayStatus,
          message: 'Statut synchronisé avec succès'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Pas de changement
    return new Response(
      JSON.stringify({ 
        success: true,
        status: payment.status,
        fedapayStatus,
        message: 'Statut déjà à jour'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
