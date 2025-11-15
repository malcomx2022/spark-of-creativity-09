import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { parseFedaPayResponse } from "./utils.ts";
import { calculateFees, parseFeeConfig, calculateHoldUntil } from "./fee-calculator.ts";
import { normalizeStatus } from "./payment-status.ts";
import { dispatchNotification } from "../_shared/notifications.ts";

const DEFAULT_APPOINTMENT_AMOUNT = 10000;

// Validation schema avec Zod
const PaymentRequestSchema = z.object({
  appointmentId: z.string().uuid({ message: "Invalid appointment ID format" }),
  amount: z.number()
    .min(100, { message: "Amount must be at least 100 XOF" })
    .max(1000000, { message: "Amount must not exceed 1,000,000 XOF" })
    .optional(),
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
    const platformWalletId = Deno.env.get('PLATFORM_WALLET_ID')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user (ou vérifier si c'est un appel service role avec bypassAuth)
    const authHeader = req.headers.get('Authorization');
    let user = null;
    let bypassAuth = false;

    // Vérifier d'abord si le body contient bypassAuth (appel depuis handle-appointment-response)
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

    // Validation Zod étendue pour inclure bypassAuth et patientId
    const PaymentRequestSchemaExtended = PaymentRequestSchema.extend({
      bypassAuth: z.boolean().optional(),
      patientId: z.string().uuid().optional()
    });

    const validationResult = PaymentRequestSchemaExtended.safeParse(payload);
    
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

    const { appointmentId, paymentMethod, phoneNumber, bypassAuth: requestBypassAuth, patientId: requestPatientId } = validationResult.data;
    const requestedAmount = validationResult.data.amount ?? null;

    // Si bypassAuth est true et qu'on a un patientId, on utilise le service role
    if (requestBypassAuth && requestPatientId) {
      bypassAuth = true;
      console.log('Service role payment creation for patient:', requestPatientId);
    } else {
      // Sinon, authentification normale
      if (!authHeader) {
        console.error('Missing Authorization header');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !authUser) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      user = authUser;
    }

    // Vérifier que l'appointment existe et appartient à l'utilisateur
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select('id, patient_id, status, payment_amount, practitioner_id, specialty')
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      console.error('Appointment not found:', appointmentError);
      return new Response(
        JSON.stringify({ error: 'Appointment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier si l'utilisateur est autorisé (patient ou praticien du rendez-vous)
    // Bypass cette vérification si c'est un appel service role
    let isAuthorized = bypassAuth;
    let paymentUserId = requestPatientId || appointment.patient_id;
    
    if (!bypassAuth && user) {
      if (appointment.patient_id === user.id) {
        isAuthorized = true;
        paymentUserId = user.id;
      } else {
        // Vérifier si l'utilisateur est le praticien du rendez-vous
        const { data: practitioner } = await supabase
          .from('practitioners')
          .select('user_id')
          .eq('id', appointment.practitioner_id)
          .single();
        
        if (practitioner && practitioner.user_id === user.id) {
          isAuthorized = true;
          paymentUserId = appointment.patient_id; // Le paiement est toujours pour le patient
        }
      }
    }

    if (!isAuthorized) {
      console.error('Appointment does not belong to user');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Appointment does not belong to you' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Générer une clé d'idempotence
    const idempotencyKey = `${paymentUserId}-${appointmentId}-${Date.now()}`;

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

    let amountToCharge = requestedAmount ?? appointment.payment_amount ?? null;

    if (amountToCharge === null) {
      const { data: rate } = await supabase
        .from('practitioner_rates')
        .select('base_price')
        .eq('practitioner_id', appointment.practitioner_id)
        .eq('service_type', appointment.specialty)
        .maybeSingle();

      amountToCharge = rate?.base_price ?? null;

      if (amountToCharge === null) {
        const { data: service } = await supabase
          .from('services')
          .select('base_price')
          .eq('name', appointment.specialty)
          .maybeSingle();

        amountToCharge = service?.base_price ?? DEFAULT_APPOINTMENT_AMOUNT;
      }
    }

    if (requestedAmount !== null && requestedAmount !== amountToCharge) {
      console.log('Requested amount differs from computed amount, using computed value', { requestedAmount, amountToCharge });
    }

    if (appointment.payment_amount !== amountToCharge) {
      await supabase
        .from('appointments')
        .update({ payment_amount: amountToCharge })
        .eq('id', appointmentId);
    }

    console.log('Creating payment:', { appointmentId, amount: amountToCharge, paymentMethod, phoneNumber, idempotencyKey });

    // Map payment methods to FedaPay mode
    const modeMap: Record<string, string> = {
      'mtn': 'mtn_bj',
      'orange': 'orange_bj',
      'moov': 'moov_bj'
    };

    const selectedMode = modeMap[paymentMethod];
    if (!selectedMode) {
      console.error('Unsupported payment method requested:', paymentMethod);
      return new Response(
        JSON.stringify({ error: 'Méthode de paiement non supportée' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // FedaPay base URL
    const fedapayBaseUrl = Deno.env.get('FEDAPAY_MODE') === 'live' 
      ? 'https://api.fedapay.com' 
      : 'https://sandbox-api.fedapay.com';

    console.log(`Using FedaPay endpoint: ${fedapayBaseUrl}`);

    // ÉTAPE 1: Créer la transaction FedaPay selon la documentation officielle
    console.log('Step 1: Creating FedaPay transaction', { platformWalletId });
    const createTransactionResponse = await fetch(`${fedapayBaseUrl}/v1/transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fedapaySecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `Paiement rendez-vous médical #${appointmentId}`,
        amount: amountToCharge,
        currency: {
          iso: 'XOF'
        },
        callback_url: `${supabaseUrl}/functions/v1/payment-webhook`,
        account_id: platformWalletId,
        customer: {
          firstname: 'Patient',
          lastname: 'User',
          email: `patient-${paymentUserId}@domicares.app`,
          phone_number: {
            number: phoneNumber.startsWith('+') ? phoneNumber.slice(1) : phoneNumber,
            country: 'bj'
          }
        }
      }),
    });

    if (!createTransactionResponse.ok) {
      const errorData = await createTransactionResponse.json();
      console.error('FedaPay transaction creation failed:', errorData);
      return new Response(
        JSON.stringify({ 
          error: 'Erreur lors de la création de la transaction de paiement',
          details: errorData
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fedapayData: any = await createTransactionResponse.json();
    console.log('FedaPay transaction created successfully:', fedapayData);

    // Extract transaction from response (FedaPay peut utiliser v1_transaction OU v1/transaction)
    const transaction = fedapayData.v1_transaction || fedapayData['v1/transaction'] || fedapayData.transaction || fedapayData;
    if (!transaction || !transaction.id) {
      console.error('Invalid transaction response structure:', fedapayData);
      return new Response(
        JSON.stringify({ error: 'Format de réponse invalide du service de paiement' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extraire l'URL de paiement directement depuis la transaction
    const paymentUrl = transaction.payment_url;
    if (!paymentUrl) {
      console.error('Payment URL not found in transaction:', transaction);
      return new Response(
        JSON.stringify({ error: 'URL de paiement non disponible dans la transaction' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Payment URL extracted from transaction:', paymentUrl);


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
    const feeBreakdown = calculateFees(amountToCharge, 'XOF', feeConfig);
    
    // Calculer la date de hold
    const holdPeriodDays = systemConfig.payment_hold_period_days?.days || 2;
    const holdUntil = calculateHoldUntil(holdPeriodDays);
    
    // Normaliser le statut initial
    const initialStatus = normalizeStatus(transaction.status || 'pending');

    // Store payment in database avec détails des frais
    const { data: payment, error: dbError } = await supabase
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        patient_id: paymentUserId,
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
        fedapay_transaction_id: transaction.id.toString(),
        fedapay_payment_url: paymentUrl,
        idempotency_key: idempotencyKey,
        channel: 'momo',
        provider_ref: transaction.id.toString(),
        payment_session_data: {
          transaction: fedapayData,
          mode: selectedMode
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
      userId: paymentUserId,
      title: 'Paiement initialisé',
        message: `Votre paiement de ${amountToCharge} XOF pour le rendez-vous a été créé. Confirmez sur votre mobile en entrant votre code PIN USSD ou cliquez pour ouvrir FedaPay.`,
      type: 'payment',
      link: paymentUrl,
    });

    // Calculer l'expiration (30 minutes pour FedaPay)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    console.log('Payment created successfully:', {
      paymentId: payment.id,
      transactionId: transaction.id,
      paymentUrl: paymentUrl
    });

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: payment.id,
        transactionId: transaction.id,
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
