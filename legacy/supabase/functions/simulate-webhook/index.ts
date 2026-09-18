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

    // Vérifier que l'utilisateur est admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { paymentId, action } = await req.json();

    if (!paymentId || !action) {
      return new Response(
        JSON.stringify({ error: 'paymentId and action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer le paiement
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payment.fedapay_transaction_id) {
      return new Response(
        JSON.stringify({ error: 'No FedaPay transaction ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construire le payload webhook selon l'action
    const webhookPayloads: Record<string, any> = {
      approve: {
        event: 'transaction.approved',
        entity: {
          id: payment.fedapay_transaction_id,
          status: 'approved',
          amount: payment.amount,
          currency: { iso: payment.currency },
        }
      },
      decline: {
        event: 'transaction.declined',
        entity: {
          id: payment.fedapay_transaction_id,
          status: 'declined',
          amount: payment.amount,
          currency: { iso: payment.currency },
        }
      },
      cancel: {
        event: 'transaction.canceled',
        entity: {
          id: payment.fedapay_transaction_id,
          status: 'canceled',
          amount: payment.amount,
          currency: { iso: payment.currency },
        }
      }
    };

    const webhookPayload = webhookPayloads[action];
    if (!webhookPayload) {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use: approve, decline, or cancel' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Appeler le webhook payment-webhook
    const webhookUrl = `${supabaseUrl}/functions/v1/payment-webhook`;
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-fedapay-signature': 'simulated-signature',
      },
      body: JSON.stringify(webhookPayload)
    });

    const webhookResult = await webhookResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        action,
        paymentId,
        webhookStatus: webhookResponse.status,
        webhookResult
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    } catch (error) {
      console.error('Error simulating webhook:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
});
