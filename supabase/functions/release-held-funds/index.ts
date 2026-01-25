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

        // Déterminer le practitioner_id selon le type de paiement
        let practitionerId: string | null = null;
        
        if (payment.appointment_id && payment.appointment_id.startsWith('group_session_')) {
          // Séance de groupe: group_session_{sessionId}_{participantId}
          console.log('🏋️ Paiement de séance de groupe détecté');
          const parts = payment.appointment_id.split('_');
          const sessionId = parts[2];
          
          const { data: sessionData, error: sessionError } = await supabase
            .from('group_sessions')
            .select('coach_id')
            .eq('id', sessionId)
            .single();
          
          if (sessionError || !sessionData) {
            console.error(`Error fetching group session for payment ${payment.id}:`, sessionError);
            results.failed++;
            results.errors.push({
              payment_id: payment.id,
              error: 'Group session not found',
              details: sessionError,
            });
            continue;
          }
          
          practitionerId = sessionData.coach_id;
        } else {
          // Rendez-vous classique
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

          practitionerId = appointment.practitioner_id;
        }

        if (!practitionerId) {
          console.error(`No practitioner ID found for payment ${payment.id}`);
          results.failed++;
          results.errors.push({
            payment_id: payment.id,
            error: 'Practitioner ID not found'
          });
          continue;
        }
        const releaseAmount = payment.net_amount || payment.amount;

        // Récupérer le solde actuel du praticien
        let { data: balance, error: balanceError } = await supabase
          .from('practitioner_balances')
          .select('*')
          .eq('practitioner_id', practitionerId)
          .single();

        if (balanceError || !balance) {
          console.log(`Balance not found for practitioner ${practitionerId}, initializing...`);
          // Créer le solde s'il n'existe pas
          const { data: newBalance, error: createError } = await supabase
            .from('practitioner_balances')
            .insert({
              practitioner_id: practitionerId,
              balance_available: 0,
              balance_pending: 0,
              balance_on_hold: releaseAmount, // Initialiser avec le montant à libérer
              currency: 'XOF'
            })
            .select()
            .single();
          
          if (createError) {
            console.error(`Error creating balance for practitioner ${practitionerId}:`, createError);
            results.failed++;
            results.errors.push({
              payment_id: payment.id,
              error: 'Failed to create balance',
              details: createError,
            });
            continue;
          }
          balance = newBalance;
        }

        // P1 #12: Verify balance consistency and handle repair with proper audit logging
        if (balance.balance_on_hold < releaseAmount) {
          console.log(`ALERT: Inconsistent balance detected for practitioner ${practitionerId}`);
          console.log(`  Expected on_hold >= ${releaseAmount}, actual on_hold = ${balance.balance_on_hold}`);

          // Log the repair attempt for audit trail
          await supabase.from('admin_audit_logs').insert({
            admin_id: null, // System action
            action: 'balance_repair_attempt',
            entity_type: 'practitioner_balance',
            entity_id: practitionerId,
            details: {
              payment_id: payment.id,
              expected_on_hold: releaseAmount,
              actual_on_hold: balance.balance_on_hold,
              balance_available: balance.balance_available,
              balance_pending: balance.balance_pending,
              triggered_by: 'release-held-funds'
            }
          });

          // Attempt repair via RPC function
          const { data: repairResult, error: repairError } = await supabase.rpc('repair_practitioner_balances');

          if (repairError) {
            console.error(`CRITICAL: Repair failed for practitioner ${practitionerId}:`, repairError);

            // Log repair failure
            await supabase.from('admin_audit_logs').insert({
              admin_id: null,
              action: 'balance_repair_failed',
              entity_type: 'practitioner_balance',
              entity_id: practitionerId,
              details: {
                payment_id: payment.id,
                error: repairError.message,
                requires_manual_review: true
              }
            });

            results.failed++;
            results.errors.push({
              payment_id: payment.id,
              error: 'Balance repair failed - requires manual review',
              practitioner_id: practitionerId,
              details: repairError,
            });
            continue;
          }

          console.log(`Repair result:`, repairResult);

          // Re-verify balance after repair
          const { data: repairedBalance, error: repairedBalanceError } = await supabase
            .from('practitioner_balances')
            .select('*')
            .eq('practitioner_id', practitionerId)
            .single();

          if (repairedBalanceError || !repairedBalance || repairedBalance.balance_on_hold < releaseAmount) {
            console.error(
              `CRITICAL: Balance still inconsistent after repair for practitioner ${practitionerId}: ` +
              `on_hold=${repairedBalance?.balance_on_hold || 0}, release_amount=${releaseAmount}`
            );

            // Log persistent inconsistency
            await supabase.from('admin_audit_logs').insert({
              admin_id: null,
              action: 'balance_repair_insufficient',
              entity_type: 'practitioner_balance',
              entity_id: practitionerId,
              details: {
                payment_id: payment.id,
                on_hold_after_repair: repairedBalance?.balance_on_hold || 0,
                required_amount: releaseAmount,
                requires_manual_review: true
              }
            });

            results.failed++;
            results.errors.push({
              payment_id: payment.id,
              error: 'Insufficient on_hold balance after repair - requires manual review',
              on_hold: repairedBalance?.balance_on_hold || 0,
              release_amount: releaseAmount,
            });
            continue;
          }

          // Log successful repair
          await supabase.from('admin_audit_logs').insert({
            admin_id: null,
            action: 'balance_repair_success',
            entity_type: 'practitioner_balance',
            entity_id: practitionerId,
            details: {
              payment_id: payment.id,
              old_on_hold: balance.balance_on_hold,
              new_on_hold: repairedBalance.balance_on_hold
            }
          });

          balance = repairedBalance;
          console.log(`Balance repaired successfully for practitioner ${practitionerId}`);
        }

        // ✅ UTILISER la fonction atomique pour garantir la cohérence
        const { error: atomicError } = await supabase.rpc('update_payment_with_balance', {
          p_payment_id: payment.id,
          p_practitioner_id: practitionerId,
          p_net_amount: releaseAmount,
          p_new_status: 'paid', // Le statut reste paid
          p_new_payout_status: 'ready',
          p_hold_until: null
        });

        if (atomicError) {
          console.error(`Error releasing funds atomically for payment ${payment.id}:`, atomicError);
          results.failed++;
          results.errors.push({
            payment_id: payment.id,
            error: 'Failed to release funds atomically',
            details: atomicError,
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
