import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseFedaPayResponse, validatePaymentRequest } from "./utils.ts";
import { calculateFees, parseFeeConfig, calculateHoldUntil } from "./fee-calculator.ts";
import { normalizeStatus } from "./payment-status.ts";

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
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch (jsonError) {
      console.error('Invalid JSON payload received:', jsonError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = validatePaymentRequest({
      appointmentId: (payload as Record<string, unknown>).appointmentId,
      amount: (payload as Record<string, unknown>).amount,
      paymentMethod: (payload as Record<string, unknown>).paymentMethod,
      phoneNumber: (payload as Record<string, unknown>).phoneNumber,
    });

    if (!validation.success || !validation.data) {
      console.warn('Validation errors:', validation.errors);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validation.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { appointmentId, amount, paymentMethod, phoneNumber } = validation.data;

    console.log('Creating payment:', { appointmentId, amount, paymentMethod, phoneNumber });

    // Map payment methods to FedaPay mode
    const modeMap = {
      'mtn': 'mtn_ci',
      'orange': 'orange_ci',
      'moov': 'moov_ci'
    };

    const selectedMode = modeMap[paymentMethod];
    if (!selectedMode) {
      console.error('Unsupported payment method requested:', paymentMethod);
      return new Response(
        JSON.stringify({ error: 'Unsupported payment method' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create FedaPay transaction
    let fedapayResponse: Response;
    try {
      fedapayResponse = await fetch('https://api.fedapay.com/v1/transactions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: `Paiement rendez-vous médical #${appointmentId}`,
          amount: amount,
          currency: {
            iso: 'XOF'
          },
          callback_url: `${supabaseUrl}/functions/v1/payment-webhook`,
          customer: {
            firstname: 'Patient',
            lastname: 'User',
            phone_number: {
              number: phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber,
              country: 'bj'
            }
          },
          mode: selectedMode
        })
      });
    } catch (networkError) {
      console.error('Network error while contacting FedaPay:', networkError);
      return new Response(
        JSON.stringify({ error: 'Unable to reach FedaPay at the moment' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let fedapayData: unknown;
    try {
      fedapayData = await fedapayResponse.json();
    } catch (parseError) {
      console.error('Unable to parse FedaPay response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid response from payment provider' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fedapayResponse.ok) {
      console.error('FedaPay error:', fedapayData);
      throw new Error(`FedaPay error: ${JSON.stringify(fedapayData)}`);
    }

    const transactionData = parseFedaPayResponse(fedapayData);

    if (!transactionData) {
      console.error('Unexpected FedaPay payload:', fedapayData);
      return new Response(
        JSON.stringify({ error: 'Invalid response from payment provider' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('FedaPay transaction created:', fedapayData);

    // Récupérer la configuration des frais
    const { data: configData } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', [
        'payment_commission_rate',
        'payment_gateway_fees',
        'payment_rounding_mode',
        'payment_hold_period_days'
      ]);
    
    const systemConfig: Record<string, any> = {};
    configData?.forEach(row => {
      systemConfig[row.key] = row.value;
    });
    
    // Calculer les frais
    const feeConfig = parseFeeConfig(systemConfig);
    const feeBreakdown = calculateFees(amount, 'XOF', feeConfig);
    
    // Calculer la date de hold
    const holdPeriodDays = systemConfig.payment_hold_period_days?.days || 2;
    const holdUntil = calculateHoldUntil(holdPeriodDays);
    
    // Normaliser le statut initial
    const initialStatus = normalizeStatus(transactionData.status || 'pending');

    // Store payment in database avec détails des frais
    const { data: payment, error: dbError } = await supabase
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        patient_id: user.id,
        amount: feeBreakdown.amount,
        currency: feeBreakdown.currency,
        payment_method: paymentMethod,
        status: initialStatus,
        commission_amount: feeBreakdown.commissionAmount,
        gateway_fees_amount: feeBreakdown.gatewayFeesAmount,
        fees_amount: feeBreakdown.feesAmount,
        net_amount: feeBreakdown.netAmount,
        hold_until: holdUntil.toISOString(),
        payout_status: 'pending',
        fedapay_transaction_id: transactionData.id.toString(),
        fedapay_payment_url: transactionData.url
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log('Payment stored in database:', payment);
    console.log('Fee breakdown:', feeBreakdown);

    return new Response(
      JSON.stringify({
        paymentId: payment.id,
        transactionId: transactionData.id,
        paymentUrl: transactionData.url,
        status: transactionData.status
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in create-payment function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
