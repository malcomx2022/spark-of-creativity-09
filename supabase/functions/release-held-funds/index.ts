import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

interface Payment {
  id: string;
  appointment_id: string;
  amount: number;
  net_amount: number | null;
  payout_status: string;
  hold_until: string | null;
}

interface PractitionerBalance {
  practitioner_id: string;
  balance_available: number;
  balance_pending: number;
  balance_on_hold: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables');
    return new Response(
      JSON.stringify({ error: 'Configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('Starting automatic funds release process...');

    // Récupérer tous les paiements dont la période de hold est expirée
    const { data: heldPayments, error: fetchError } = await supabase
      .from('payments')
      .select('id, appointment_id, amount, net_amount, payout_status, hold_until')
      .eq('payout_status', 'held')
      .lt('hold_until', new Date().toISOString())
      .eq('status', 'paid');

    if (fetchError) {
      console.error('Error fetching held payments:', fetchError);
      throw fetchError;
    }

    if (!heldPayments || heldPayments.length === 0) {
      console.log('No payments to release');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No payments to release',
          released_count: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${heldPayments.length} payments to release`);

    const results = {
      total: heldPayments.length,
      released: 0,
      failed: 0,
      errors: [] as any[],
    };

    // Traiter chaque paiement
    for (const payment of heldPayments) {
      try {
        console.log(`Processing payment ${payment.id}...`);

        // Récupérer l'appointment pour trouver le practitioner
        const { data: appointment, error: appointmentError } = await supabase
          .from('appointments')
          .select('practitioner_id')
          .eq('id', payment.appointment_id)
          .single();

        if (appointmentError || !appointment) {
          console.error(`Error fetching appointment for payment ${payment.id}:`, appointmentError);
          results.failed++;
          results.errors.push({
            payment_id: payment.id,
            error: 'Appointment not found',
            details: appointmentError,
          });
          continue;
        }

        const practitionerId = appointment.practitioner_id;
        const releaseAmount = payment.net_amount || payment.amount;

        // Récupérer le solde actuel du praticien
        const { data: balance, error: balanceError } = await supabase
          .from('practitioner_balances')
          .select('*')
          .eq('practitioner_id', practitionerId)
          .single();

        if (balanceError || !balance) {
          console.error(`Error fetching balance for practitioner ${practitionerId}:`, balanceError);
          results.failed++;
          results.errors.push({
            payment_id: payment.id,
            error: 'Balance not found',
            details: balanceError,
          });
          continue;
        }

        // Vérifier que le montant est cohérent
        if (balance.balance_on_hold < releaseAmount) {
          console.error(
            `Inconsistent balance for practitioner ${practitionerId}: ` +
            `on_hold=${balance.balance_on_hold}, release_amount=${releaseAmount}`
          );
          results.failed++;
          results.errors.push({
            payment_id: payment.id,
            error: 'Insufficient on_hold balance',
            on_hold: balance.balance_on_hold,
            release_amount: releaseAmount,
          });
          continue;
        }

        // Transaction: Mettre à jour le paiement et le solde
        const { error: updatePaymentError } = await supabase
          .from('payments')
          .update({ payout_status: 'ready' })
          .eq('id', payment.id);

        if (updatePaymentError) {
          console.error(`Error updating payment ${payment.id}:`, updatePaymentError);
          results.failed++;
          results.errors.push({
            payment_id: payment.id,
            error: 'Failed to update payment',
            details: updatePaymentError,
          });
          continue;
        }

        const { error: updateBalanceError } = await supabase
          .from('practitioner_balances')
          .update({
            balance_available: balance.balance_available + releaseAmount,
            balance_on_hold: balance.balance_on_hold - releaseAmount,
          })
          .eq('practitioner_id', practitionerId);

        if (updateBalanceError) {
          console.error(`Error updating balance for practitioner ${practitionerId}:`, updateBalanceError);
          
          // Rollback: remettre le paiement en held
          await supabase
            .from('payments')
            .update({ payout_status: 'held' })
            .eq('id', payment.id);

          results.failed++;
          results.errors.push({
            payment_id: payment.id,
            error: 'Failed to update balance (rolled back)',
            details: updateBalanceError,
          });
          continue;
        }

        // Créer un événement de paiement
        const { error: eventError } = await supabase
          .from('payment_events')
          .insert({
            payment_id: payment.id,
            event_type: 'funds_released',
            event_data: {
              old_status: 'held',
              new_status: 'ready',
              amount: releaseAmount,
              practitioner_id: practitionerId,
              released_at: new Date().toISOString(),
            },
          });

        if (eventError) {
          console.error(`Warning: Failed to create payment event for ${payment.id}:`, eventError);
        }

        console.log(`Successfully released funds for payment ${payment.id} (${releaseAmount} XOF)`);
        results.released++;

      } catch (error) {
        console.error(`Error processing payment ${payment.id}:`, error);
        results.failed++;
        results.errors.push({
          payment_id: payment.id,
          error: 'Unexpected error',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`Funds release completed: ${results.released} released, ${results.failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in release-held-funds function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
