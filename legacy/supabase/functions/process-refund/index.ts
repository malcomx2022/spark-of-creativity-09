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
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;
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

    const { paymentId, refundAmount, reason } = await req.json();

    console.log('Processing refund for payment:', paymentId, 'amount:', refundAmount);

    // P1 #11: Validate refund amount is positive when provided
    if (refundAmount !== null && refundAmount !== undefined) {
      const parsedAmount = Number(refundAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return new Response(
          JSON.stringify({ error: 'Refund amount must be a positive number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get payment details
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*, appointments(practitioner_id)')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      throw new Error('Payment not found');
    }

    if (payment.status !== 'paid' && payment.status !== 'partially_refunded') {
      throw new Error('Can only refund paid or partially refunded payments');
    }

    // P1 #5: Idempotency check - verify no existing completed refund for this payment
    const { data: existingRefunds, error: existingRefundsError } = await supabase
      .from('payment_refunds')
      .select('id, refund_amount, status')
      .eq('payment_id', paymentId)
      .eq('status', 'completed');

    if (existingRefundsError) {
      console.error('Error checking existing refunds:', existingRefundsError);
      throw new Error('Failed to verify refund status');
    }

    // Calculate total already refunded
    const totalRefunded = existingRefunds?.reduce((sum, r) => sum + (r.refund_amount || 0), 0) || 0;
    const remainingRefundable = payment.amount - totalRefunded;

    if (remainingRefundable <= 0) {
      return new Response(
        JSON.stringify({ error: 'This payment has already been fully refunded' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const actualRefundAmount = refundAmount ? Math.min(refundAmount, remainingRefundable) : remainingRefundable;

    if (actualRefundAmount > remainingRefundable) {
      return new Response(
        JSON.stringify({
          error: `Refund amount exceeds remaining refundable amount (${remainingRefundable} XOF)`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ CORRECTION P0 #1: URL dynamique basée sur FEDAPAY_MODE
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    const fedapayBaseUrl = fedapayMode === 'live' 
      ? 'https://api.fedapay.com' 
      : 'https://sandbox-api.fedapay.com';
    
    // Call FedaPay refund API
    let fedapayRefund;
    try {
      const fedapayResponse = await fetch(
        `${fedapayBaseUrl}/v1/transactions/${payment.fedapay_transaction_id}/refund`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${fedapaySecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: actualRefundAmount
          })
        }
      );

      fedapayRefund = await fedapayResponse.json();
      
      if (!fedapayResponse.ok) {
        throw new Error(`FedaPay refund failed: ${JSON.stringify(fedapayRefund)}`);
      }
    } catch (error) {
      console.error('FedaPay refund error:', error);
      throw new Error('Failed to process refund with payment provider');
    }

    // Create refund record
    const { data: refund, error: refundError } = await supabase
      .from('payment_refunds')
      .insert({
        payment_id: paymentId,
        refund_amount: actualRefundAmount,
        refund_reason: reason,
        refunded_by: user.id,
        provider_refund_id: fedapayRefund?.v1?.id?.toString(),
        status: 'completed'
      })
      .select()
      .single();

    if (refundError) {
      throw refundError;
    }

    // Update payment status based on total refunded amount
    const newTotalRefunded = totalRefunded + actualRefundAmount;
    await supabase
      .from('payments')
      .update({
        status: newTotalRefunded >= payment.amount ? 'refunded' : 'partially_refunded'
      })
      .eq('id', paymentId);

    // Apply refund to ledger
    const practitionerId = payment.appointments?.practitioner_id;
    if (practitionerId) {
      // Get practitioner balance
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .single();

      if (balance) {
        // Calculate refund impact on net amount
        const refundRatio = actualRefundAmount / payment.amount;
        const netRefund = Math.round(payment.net_amount * refundRatio);

        // Check if payout already sent
        const isPaid = balance.balance_available >= netRefund;

        await supabase
          .from('practitioner_balances')
          .update({
            balance_available: isPaid ? balance.balance_available - netRefund : balance.balance_available,
            balance_pending: !isPaid ? balance.balance_pending - netRefund : balance.balance_pending,
            balance_on_hold: balance.balance_on_hold - netRefund
          })
          .eq('practitioner_id', practitionerId);

        // Create ledger entries for refund
        const { data: platformCash } = await supabase
          .from('ledger_accounts')
          .select('id')
          .eq('owner_type', 'platform')
          .eq('account_type', 'cash')
          .single();

        const { data: practitionerPayable } = await supabase
          .from('ledger_accounts')
          .select('id')
          .eq('owner_type', 'practitioner')
          .eq('owner_id', practitionerId)
          .eq('account_type', 'payable')
          .single();

        if (platformCash && practitionerPayable) {
          await supabase
            .from('ledger_entries')
            .insert([
              {
                account_id: platformCash.id,
                debit: 0,
                credit: actualRefundAmount,
                currency: payment.currency,
                reference_type: 'refund',
                reference_id: refund.id,
                description: 'Refund to patient'
              },
              {
                account_id: practitionerPayable.id,
                debit: netRefund,
                credit: 0,
                currency: payment.currency,
                reference_type: 'refund',
                reference_id: refund.id,
                description: 'Refund deducted from practitioner'
              }
            ]);
        }
      }
    }

    // Log audit
    await supabase
      .from('admin_audit_logs')
      .insert({
        admin_id: user.id,
        action: 'process_refund',
        entity_type: 'payment',
        entity_id: paymentId,
        details: {
          refund_amount: actualRefundAmount,
          reason,
          refund_id: refund.id
        }
      });

    console.log('Refund processed successfully');

    return new Response(
      JSON.stringify({
        refundId: refund.id,
        refundAmount: actualRefundAmount,
        status: 'completed'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-refund:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
