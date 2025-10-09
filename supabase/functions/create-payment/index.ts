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

    const { appointmentId, amount, paymentMethod, phoneNumber }: PaymentRequest = await req.json();

    console.log('Creating payment:', { appointmentId, amount, paymentMethod, phoneNumber });

    // Map payment methods to FedaPay mode
    const modeMap = {
      'mtn': 'mtn_ci',
      'orange': 'orange_ci',
      'moov': 'moov_ci'
    };

    // Create FedaPay transaction
    const fedapayResponse = await fetch('https://api.fedapay.com/v1/transactions', {
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
        mode: modeMap[paymentMethod]
      })
    });

    if (!fedapayResponse.ok) {
      const errorData = await fedapayResponse.json();
      console.error('FedaPay error:', errorData);
      throw new Error(`FedaPay error: ${JSON.stringify(errorData)}`);
    }

    const fedapayData = await fedapayResponse.json();
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
        fedapay_transaction_id: fedapayData.v1.id.toString(),
        fedapay_payment_url: fedapayData.v1.url
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
        transactionId: fedapayData.v1.id,
        paymentUrl: fedapayData.v1.url,
        status: fedapayData.v1.status
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
