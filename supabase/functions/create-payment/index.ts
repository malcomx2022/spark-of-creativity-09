import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaymentRequest {
  appointmentId: string;
  amount: number;
  paymentMethod: 'mtn' | 'orange' | 'moov';
  phoneNumber: string;
}

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
    const authHeader = req.headers.get('Authorization')!;
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

    const { appointmentId, amount, paymentMethod, phoneNumber } = payload as Partial<PaymentRequest>;

    const validationErrors: string[] = [];

    if (!appointmentId || typeof appointmentId !== 'string') {
      validationErrors.push('appointmentId must be a non-empty string');
    }

    if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount) || amount <= 0) {
      validationErrors.push('amount must be a positive number');
    }

    const allowedMethods: PaymentRequest['paymentMethod'][] = ['mtn', 'orange', 'moov'];
    if (!paymentMethod || !allowedMethods.includes(paymentMethod)) {
      validationErrors.push(`paymentMethod must be one of: ${allowedMethods.join(', ')}`);
    }

    const phoneRegex = /^\+?[0-9]{8,15}$/;
    if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneRegex.test(phoneNumber)) {
      validationErrors.push('phoneNumber must be a valid international phone number');
    }

    if (validationErrors.length > 0) {
      console.warn('Validation errors:', validationErrors);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: validationErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
              number: phoneNumber,
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

    if (!fedapayResponse.ok) {
      const errorData = await fedapayResponse.json();
      console.error('FedaPay error:', errorData);
      throw new Error(`FedaPay error: ${JSON.stringify(errorData)}`);
    }

    const fedapayData = await fedapayResponse.json();
    const transactionData = (fedapayData as { v1?: { id?: number | string; url?: string; status?: string } }).v1;

    if (!transactionData || !transactionData.id || !transactionData.url) {
      console.error('Unexpected FedaPay payload:', fedapayData);
      return new Response(
        JSON.stringify({ error: 'Invalid response from payment provider' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('FedaPay transaction created:', fedapayData);

    // Store payment in database
    const { data: payment, error: dbError } = await supabase
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        patient_id: user.id,
        amount: amount,
        currency: 'XOF',
        payment_method: paymentMethod,
        status: 'pending',
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
