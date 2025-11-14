import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { parseFedaPayResponse } from "./utils.ts";
import { calculateFees, parseFeeConfig, calculateHoldUntil } from "./fee-calculator.ts";
import { normalizeStatus } from "./payment-status.ts";
import { dispatchNotification } from "../_shared/notifications.ts";

// Validation schema avec Zod
const PaymentRequestSchema = z.object({
  appointmentId: z.string().uuid({ message: "Invalid appointment ID format" }),
  amount: z.number()
    .min(100, { message: "Amount must be at least 100 XOF" })
    .max(1000000, { message: "Amount must not exceed 1,000,000 XOF" }),
  paymentMethod: z.enum(['mtn', 'orange', 'moov'], { 
    errorMap: () => ({ message: "Payment method must be 'mtn', 'orange', or 'moov'" })
  }),
  phoneNumber: z.string()
    .regex(/^\+[1-9]\d{8,14}$/, { message: "Phone number must be in international format (e.g., +22912345678)" })
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FedaPayUssdResult {
  attempted: boolean;
  success: boolean;
  payload?: unknown;
  error?: string;
}

async function triggerFedapayUssdValidation({
  transactionId,
  phoneNumber,
  mode,
  fedapaySecretKey,
  fedapayBaseUrl,
}: {
  transactionId: string;
  phoneNumber: string;
  mode: string;
  fedapaySecretKey: string;
  fedapayBaseUrl: string;
}): Promise<FedaPayUssdResult> {
  const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber;

  try {
    console.log('Triggering FedaPay USSD validation request', { transactionId, mode });
    const response = await fetch(`${fedapayBaseUrl}/v1/transactions/${transactionId}/send_otp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fedapaySecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'ussd',
        mode,
        customer: {
          phone_number: {
            number: normalizedPhone,
            country: 'bj',
          },
        },
      }),
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch (error) {
      console.warn('Unable to parse USSD trigger response', error);
    }

    if (!response.ok) {
      console.error('FedaPay USSD trigger returned an error', data);
      return {
        attempted: true,
        success: false,
        error: `HTTP ${response.status}`,
        payload: data,
      };
    }

    console.log('FedaPay USSD validation successfully triggered');
    return {
      attempted: true,
      success: true,
      payload: data,
    };
  } catch (error) {
    console.error('Unable to trigger FedaPay USSD validation', error);
    return {
      attempted: true,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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

    // Validation Zod stricte
    const validationResult = PaymentRequestSchema.safeParse(payload);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      console.warn('Zod validation errors:', errors);
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { appointmentId, amount, paymentMethod, phoneNumber } = validationResult.data;

    // Vérifier que l'appointment existe et appartient à l'utilisateur
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('id, patient_id, status')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      console.error('Appointment not found:', appointmentError);
      return new Response(
        JSON.stringify({ error: 'Appointment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (appointment.patient_id !== user.id) {
      console.error('Appointment does not belong to user');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Appointment does not belong to you' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Générer une clé d'idempotence
    const idempotencyKey = `${user.id}-${appointmentId}-${Date.now()}`;

    // Vérifier si l'appointment a déjà été payé
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('appointment_id', appointmentId)
      .in('status', ['pending', 'paid', 'initiated'])
      .maybeSingle();

    if (existingPayment) {
      console.log('Payment already exists for this appointment:', existingPayment);
      return new Response(
        JSON.stringify({
          paymentId: existingPayment.id,
          transactionId: existingPayment.fedapay_transaction_id,
          paymentUrl: existingPayment.fedapay_payment_url,
          status: existingPayment.status,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          message: 'Payment already initiated'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating payment:', { appointmentId, amount, paymentMethod, phoneNumber, idempotencyKey });

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

    // Étape 1: Créer la transaction FedaPay
    let fedapayResponse: Response | null = null;
    let lastError: Error | null = null;
    const maxRetries = 3;
    const timeoutMs = 10000;
    const fedapayBaseUrl = Deno.env.get('FEDAPAY_MODE') === 'live' 
      ? 'https://api.fedapay.com' 
      : 'https://sandbox-api.fedapay.com';

    console.log(`Using FedaPay endpoint: ${fedapayBaseUrl}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`FedaPay attempt ${attempt}/${maxRetries} - Creating transaction`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        fedapayResponse = await fetch(`${fedapayBaseUrl}/v1/transactions`, {
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
              email: `patient-${user.id}@santemada.app`,
              phone_number: {
                number: phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber,
                country: 'bj'
              }
            },
            mode: selectedMode
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        break; // Success, exit retry loop
        
      } catch (error) {
        lastError = error as Error;
        console.error(`FedaPay attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          console.error('All FedaPay retry attempts failed');
          return new Response(
            JSON.stringify({ 
              error: 'Impossible de contacter le service de paiement. Veuillez réessayer.',
              details: lastError.message
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (!fedapayResponse) {
      return new Response(
        JSON.stringify({ error: 'Échec de la création de la transaction' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let fedapayData: unknown;
    try {
      fedapayData = await fedapayResponse.json();
    } catch (parseError) {
      console.error('Unable to parse FedaPay response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Réponse invalide du service de paiement' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fedapayResponse.ok) {
      console.error('FedaPay error response:', fedapayData);
      return new Response(
        JSON.stringify({ 
          error: 'Erreur lors de la création du paiement',
          details: fedapayData
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('FedaPay transaction created successfully:', fedapayData);

    // Extraire l'ID de la transaction
    const transactionData = parseFedaPayResponse(fedapayData);
    if (!transactionData) {
      console.error('Unexpected FedaPay payload structure:', fedapayData);
      return new Response(
        JSON.stringify({ error: 'Format de réponse invalide du service de paiement' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Étape 2: Générer le token pour obtenir l'URL de paiement
    console.log(`Generating payment token for transaction ${transactionData.id}`);
    
    let tokenResponse: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      tokenResponse = await fetch(`${fedapayBaseUrl}/v1/transactions/${transactionData.id}/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
    } catch (error) {
      console.error('Error generating token:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Impossible de générer le lien de paiement',
          details: error instanceof Error ? error.message : 'Unknown error'
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let tokenData: unknown;
    try {
      tokenData = await tokenResponse.json();
    } catch (parseError) {
      console.error('Unable to parse token response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Réponse invalide lors de la génération du lien de paiement' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenResponse.ok) {
      console.error('FedaPay token generation error:', tokenData);
      return new Response(
        JSON.stringify({ 
          error: 'Erreur lors de la génération du lien de paiement',
          details: tokenData
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token generated successfully:', tokenData);

    // Parser la réponse du token
    const tokenInfo = parseFedaPayResponse(tokenData);
    if (!tokenInfo || !tokenInfo.url) {
      console.error('Invalid token response structure:', tokenData);
      return new Response(
        JSON.stringify({ error: 'URL de paiement non disponible' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentUrl = tokenInfo.url;
    const ussdTriggerResult = await triggerFedapayUssdValidation({
      transactionId: transactionData.id,
      phoneNumber,
      mode: selectedMode,
      fedapaySecretKey,
      fedapayBaseUrl,
    });
    if (!ussdTriggerResult.success) {
      console.warn('FedaPay USSD trigger failed', ussdTriggerResult);
    }
    console.log('Payment URL generated:', paymentUrl);

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
        fedapay_payment_url: paymentUrl,
        idempotency_key: idempotencyKey,
        channel: 'mobile_money',
        provider_ref: transactionData.id.toString(),
        payment_session_data: {
          transaction: fedapayData,
          token: tokenData,
          mode: selectedMode,
          ussd: ussdTriggerResult
        }
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log('Payment stored in database:', payment);
    console.log('Fee breakdown:', feeBreakdown);

    // ✅ CORRECTION ERREUR #1: Initialiser le solde praticien
    // Récupérer le practitioner_id depuis l'appointment
    const { data: appointmentData } = await supabase
      .from('appointments')
      .select('practitioner_id')
      .eq('id', appointmentId)
      .single();

    if (appointmentData?.practitioner_id) {
      console.log('Initializing practitioner balance:', appointmentData.practitioner_id, feeBreakdown.netAmount);
      
      const { error: balanceError } = await supabase.rpc('initialize_payment_balance', {
        p_payment_id: payment.id,
        p_practitioner_id: appointmentData.practitioner_id,
        p_net_amount: feeBreakdown.netAmount
      });

      if (balanceError) {
        console.error('Error initializing practitioner balance:', balanceError);
        // Non-bloquant, on log juste l'erreur
      } else {
        console.log('Practitioner balance initialized successfully');
      }
    }

    // Émettre événement payment.intent.created
    await supabase
      .from('payment_events')
      .insert({
        payment_id: payment.id,
        event_type: 'payment.intent.created',
        event_data: {
          amount: feeBreakdown.amount,
          currency: feeBreakdown.currency,
          payment_method: paymentMethod,
          idempotency_key: idempotencyKey
        }
      });

    // Envoyer notification au patient
    await dispatchNotification({
      supabase,
      supabaseUrl,
      serviceRoleKey: supabaseKey,
      userId: user.id,
      title: 'Paiement initialisé',
      message: `Votre paiement de ${amount} XOF pour le rendez-vous a été créé. Confirmez sur votre mobile en entrant votre code PIN USSD ou cliquez pour ouvrir FedaPay.`,
      type: 'payment',
      link: paymentUrl,
    });

    // Calculer l'expiration (30 minutes pour FedaPay)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    console.log('Payment created successfully:', {
      paymentId: payment.id,
      transactionId: transactionData.id,
      paymentUrl: paymentUrl
    });

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: payment.id,
        transactionId: transactionData.id,
        paymentUrl: paymentUrl,
        status: initialStatus,
        expiresAt: expiresAt,
        message: 'Paiement initialisé avec succès'
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
