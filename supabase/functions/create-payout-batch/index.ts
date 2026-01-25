import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { practitionerIds, paymentMethod } = await req.json();

    console.log('Creating payout batch for practitioners:', practitionerIds);

    // Get practitioners with available balance
    const { data: balances, error: balancesError } = await supabase
      .from('practitioner_balances')
      .select('*, practitioners(id, name, user_id)')
      .in('practitioner_id', practitionerIds)
      .gt('balance_available', 0);

    if (balancesError) {
      throw balancesError;
    }

    if (!balances || balances.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No practitioners with available balance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total amount
    const totalAmount = balances.reduce((sum, b) => sum + b.balance_available, 0);

    // Create payout batch
    const { data: batch, error: batchError } = await supabase
      .from('payout_batches')
      .insert({
        created_by: user.id,
        payment_method: paymentMethod,
        total_amount: totalAmount,
        practitioners_count: balances.length,
        status: 'queued'
      })
      .select()
      .single();

    if (batchError) {
      throw batchError;
    }

    // Create individual payouts
    const payouts = balances.map(balance => ({
      batch_id: batch.id,
      practitioner_id: balance.practitioner_id,
      amount: balance.balance_available,
      net_amount: balance.balance_available,
      currency: balance.currency,
      payment_method: paymentMethod,
      status: 'planned',
      period_start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
      period_end: new Date().toISOString().split('T')[0]
    }));

    const { error: payoutsError } = await supabase
      .from('practitioner_payouts')
      .insert(payouts);

    if (payoutsError) {
      throw payoutsError;
    }

    // P1 #6: Deduct available balances - BLOCKING operation
    const practitionerIdsArray = balances.map(b => b.practitioner_id);

    console.log('Deducting available balances for batch:', batch.id);
    const { error: balanceError } = await supabase
      .from('practitioner_balances')
      .update({
        balance_available: 0,
        updated_at: new Date().toISOString()
      })
      .in('practitioner_id', practitionerIdsArray);

    if (balanceError) {
      console.error('CRITICAL: Failed to deduct balances:', balanceError);
      // Rollback: delete the batch and payouts since balance deduction failed
      await supabase.from('practitioner_payouts').delete().eq('batch_id', batch.id);
      await supabase.from('payout_batches').delete().eq('id', batch.id);
      throw new Error('Failed to deduct practitioner balances. Batch creation cancelled.');
    }

    // Log audit
    await supabase
      .from('admin_audit_logs')
      .insert({
        admin_id: user.id,
        action: 'create_payout_batch',
        entity_type: 'payout_batch',
        entity_id: batch.id,
        details: {
          practitioners_count: balances.length,
          total_amount: totalAmount,
          payment_method: paymentMethod
        }
      });

    console.log('Payout batch created successfully:', batch.id);

    return new Response(
      JSON.stringify({
        batchId: batch.id,
        totalAmount,
        practitionersCount: balances.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-payout-batch:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
