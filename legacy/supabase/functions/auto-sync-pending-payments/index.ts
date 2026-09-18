import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FedaPayTransactionStatus {
  id: number;
  status: string;
  amount: number;
  description?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting auto-sync of pending payments...');

    // Get credentials
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Configuration: considérer un paiement "bloqué" après 10 minutes
    // Standardisé avec create-payment et PaymentDialog pour cohérence
    const staleThresholdMinutes = 10;
    const staleThreshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

    console.log(`Looking for payments stuck in initiated/pending since before ${staleThreshold.toISOString()}`);

    // Récupérer les paiements bloqués
    const { data: stalePayments, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .in('status', ['initiated', 'pending'])
      .not('fedapay_transaction_id', 'is', null)
      .lt('created_at', staleThreshold.toISOString())
      .order('created_at', { ascending: true })
      .limit(50); // Limiter à 50 pour éviter de surcharger

    if (fetchError) {
      console.error('Error fetching stale payments:', fetchError);
      throw fetchError;
    }

    if (!stalePayments || stalePayments.length === 0) {
      console.log('No stale payments found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stale payments to sync',
          synced_count: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${stalePayments.length} stale payments to check`);

    const fedapayApiUrl = fedapayMode === 'live' 
      ? 'https://api.fedapay.com/v1/transactions'
      : 'https://sandbox-api.fedapay.com/v1/transactions';

    const results = {
      synced: 0,
      failed: 0,
      unchanged: 0,
      errors: [] as string[],
    };

    // Vérifier chaque paiement auprès de FedaPay
    for (const payment of stalePayments) {
      try {
        console.log(`Checking payment ${payment.id} with FedaPay transaction ${payment.fedapay_transaction_id}`);

        // Interroger FedaPay pour le statut actuel
        const fedapayResponse = await fetch(
          `${fedapayApiUrl}/${payment.fedapay_transaction_id}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${fedapaySecretKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!fedapayResponse.ok) {
          const errorText = await fedapayResponse.text();
          console.error(`FedaPay API error for transaction ${payment.fedapay_transaction_id}:`, errorText);
          results.failed++;
          results.errors.push(`Payment ${payment.id}: FedaPay API error ${fedapayResponse.status}`);
          continue;
        }

        const fedapayData = await fedapayResponse.json();
        const fedapayTransaction: FedaPayTransactionStatus = fedapayData.v1?.transaction || fedapayData;

        // Mapper le statut FedaPay vers notre statut normalisé
        const statusMap: Record<string, string> = {
          'approved': 'paid',
          'transferred': 'paid',
          'pending': 'pending',
          'failed': 'failed',
          'canceled': 'canceled',
          'declined': 'failed',
        };

        const newStatus = statusMap[fedapayTransaction.status] || fedapayTransaction.status;

        // Si le statut a changé, mettre à jour
        if (newStatus !== payment.status) {
          console.log(`Updating payment ${payment.id}: ${payment.status} -> ${newStatus}`);

          // Récupérer le practitioner_id depuis l'appointment
          const { data: appointment } = await supabase
            .from('appointments')
            .select('practitioner_id')
            .eq('id', payment.appointment_id)
            .single();

          if (!appointment) {
            console.error(`Appointment not found for payment ${payment.id}`);
            results.failed++;
            results.errors.push(`Payment ${payment.id}: Appointment not found`);
            continue;
          }

          // Déterminer le payout_status et hold_until
          let payoutStatus = payment.payout_status;
          let holdUntil = payment.hold_until;

          if (newStatus === 'paid') {
            payoutStatus = 'held';
            // Hold period de 48h
            holdUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
          } else if (newStatus === 'failed' || newStatus === 'canceled') {
            payoutStatus = 'failed';
            holdUntil = null;
          }

          // Utiliser la fonction atomique pour mettre à jour payment + balance
          const { data: updateResult, error: updateError } = await supabase.rpc(
            'update_payment_with_balance',
            {
              p_payment_id: payment.id,
              p_practitioner_id: appointment.practitioner_id,
              p_net_amount: payment.net_amount || payment.amount,
              p_new_status: newStatus,
              p_new_payout_status: payoutStatus,
              p_hold_until: holdUntil,
            }
          );

          if (updateError) {
            console.error(`Error updating payment ${payment.id}:`, updateError);
            results.failed++;
            results.errors.push(`Payment ${payment.id}: Update failed - ${updateError.message}`);
            continue;
          }

          // Mettre à jour l'appointment si paiement réussi
          if (newStatus === 'paid' && payment.status !== 'paid') {
            await supabase
              .from('appointments')
              .update({ 
                status: 'confirmed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', payment.appointment_id);
          }

          // Créer un événement de traçabilité
          await supabase
            .from('payment_events')
            .insert({
              payment_id: payment.id,
              event_type: 'auto_synced',
              event_data: {
                old_status: payment.status,
                new_status: newStatus,
                fedapay_status: fedapayTransaction.status,
                synced_at: new Date().toISOString(),
              },
            });

          results.synced++;
          console.log(`Successfully synced payment ${payment.id}`);
        } else {
          console.log(`Payment ${payment.id} status unchanged: ${payment.status}`);
          results.unchanged++;
        }

      } catch (error) {
        console.error(`Error processing payment ${payment.id}:`, error);
        results.failed++;
        results.errors.push(`Payment ${payment.id}: ${(error as Error).message}`);
      }
    }

    console.log('Auto-sync completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${stalePayments.length} stale payments`,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-sync error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
