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
    .regex(/^\+[1-9]\d{8,14}$/, { message: "Phone number must be in international format (e.g., +22912345678)" }),
  payerName: z.string().min(2, { message: "Payer name must be at least 2 characters" }),
  payerEmail: z.string().email({ message: "Invalid email format" }).optional(),
});

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

    const { 
      appointmentId, 
      paymentMethod, 
      phoneNumber, 
      payerName,
      payerEmail,
      bypassAuth: requestBypassAuth, 
      patientId: requestPatientId 
    } = validationResult.data;
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
        JSON.stringify({ error: 'Rendez-vous non trouvé' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier les droits (sauf si bypassAuth)
    const paymentUserId = requestBypassAuth && requestPatientId ? requestPatientId : user!.id;
    if (!bypassAuth && appointment.patient_id !== paymentUserId) {
      console.error('Unauthorized access to appointment');
      return new Response(
        JSON.stringify({ error: 'Vous n\'êtes pas autorisé à payer pour ce rendez-vous' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier le statut de l'appointment
    if (!['confirmed', 'pending_payment'].includes(appointment.status)) {
      console.error('Appointment not in a payable state:', appointment.status);
      return new Response(
        JSON.stringify({ error: 'Ce rendez-vous n\'est pas dans un état payable' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Déterminer le montant à facturer
    const amountToCharge = requestedAmount ?? appointment.payment_amount ?? DEFAULT_APPOINTMENT_AMOUNT;
    console.log('Payment initiated:', { appointmentId, amountToCharge, paymentMethod, phoneNumber });

    // Créer l'idempotency key
    const idempotencyKey = `${appointmentId}-${Date.now()}`;

    // Vérifier si un paiement pending existe déjà pour ce rendez-vous
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('id, status, created_at')
      .eq('appointment_id', appointmentId)
      .in('status', ['initiated', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingPayments && existingPayments.length > 0) {
      const existingPayment = existingPayments[0];
      const paymentAge = Date.now() - new Date(existingPayment.created_at).getTime();
      const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
      
      // Si le paiement a plus de 15 minutes, le marquer comme expiré
      if (paymentAge > PAYMENT_TIMEOUT_MS) {
        console.log('Existing payment expired, marking as failed:', existingPayment.id);
        await supabase
          .from('payments')
          .update({ 
            status: 'failed',
            payout_status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPayment.id);
        
        // Mettre à jour l'appointment
        await supabase
          .from('appointments')
          .update({ 
            status: 'confirmed',
            updated_at: new Date().toISOString()
          })
          .eq('id', appointmentId);
          
        console.log('Expired payment cleaned up, proceeding with new payment');
      } else {
        // Paiement récent, bloquer la création
        const remainingMinutes = Math.ceil((PAYMENT_TIMEOUT_MS - paymentAge) / 60000);
        console.log('Existing pending payment found:', existingPayment);
        return new Response(
          JSON.stringify({ 
            error: `Un paiement est déjà en cours pour ce rendez-vous. Veuillez réessayer dans ${remainingMinutes} minute(s).`,
            paymentId: existingPayment.id,
            retryAfter: remainingMinutes
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Map payment methods to FedaPay modes
    const modeMap: Record<string, string> = {
      'mtn': 'mtn_benin',
      'moov': 'moov_benin',
      'orange': 'orange_money_benin',
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

    // Préparer les informations du client pour FedaPay
    const nameParts = payerName.trim().split(/\s+/);
    const firstname = nameParts[0] || 'Patient';
    const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Domicares';
    const customerEmail = payerEmail || `patient-${paymentUserId}@domicares.app`;

    // ÉTAPE 1: Créer la transaction FedaPay selon la documentation officielle
    console.log('Step 1: Creating FedaPay transaction with payer info:', { firstname, lastname, email: customerEmail });
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
        customer: {
          firstname,
          lastname,
          email: customerEmail,
          phone: phoneNumber
        },
        custom_metadata: {
          appointment_id: appointmentId,
          user_id: paymentUserId,
          payment_method: paymentMethod,
          payer_name: payerName,
          payer_email: payerEmail || null
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
    
    // ÉTAPE 2: Générer le token de paiement
    console.log('Step 2: Generating payment token for transaction:', transaction.id);
    const generateTokenResponse = await fetch(`${fedapayBaseUrl}/v1/transactions/${transaction.id}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fedapaySecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: selectedMode
      })
    });

    if (!generateTokenResponse.ok) {
      const tokenError = await generateTokenResponse.json();
      console.error('FedaPay token generation failed:', tokenError);
      return new Response(
        JSON.stringify({ 
          error: 'Erreur lors de la génération du token de paiement',
          details: tokenError
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData: any = await generateTokenResponse.json();
    console.log('FedaPay token generated successfully:', tokenData);
    
    // FedaPay retourne directement { token: "...", url: "..." }
    const paymentToken = tokenData.token;
    const paymentUrl = tokenData.url;
    
    if (!paymentToken || !paymentUrl) {
      console.error('Payment token or URL not found in response:', tokenData);
      return new Response(
        JSON.stringify({ 
          error: 'Token ou URL de paiement non disponible',
          details: { hasToken: !!paymentToken, hasUrl: !!paymentUrl }
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Payment URL extracted:', paymentUrl);

    // Pour mobile money, envoyer une demande de paiement directe au numéro
    if (['mtn_benin', 'moov_benin'].includes(selectedMode)) {
      console.log('Sending mobile money payment request for transaction:', transaction.id);
      const sendPaymentResponse = await fetch(`${fedapayBaseUrl}/v1/transactions/${transaction.id}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: selectedMode,
          customer: {
            phone: phoneNumber
          }
        })
      });

      if (!sendPaymentResponse.ok) {
        const sendError = await sendPaymentResponse.text();
        console.warn('Mobile money payment request failed:', sendError);
      } else {
        try {
          const sendData = await sendPaymentResponse.json();
          console.log('Mobile money payment request sent successfully:', sendData);
        } catch (e) {
          // FedaPay peut retourner une réponse vide ou non-JSON
          console.log('Mobile money payment request sent (no JSON response)');
        }
      }
    }

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
    const holdPeriodDays = systemConfig.payment_hold_period_days?.days || 2;
    const holdUntil = calculateHoldUntil(holdPeriodDays);

    console.log('Fee breakdown:', feeBreakdown);

    // Enregistrer le paiement dans la base de données
    const { data: payment, error: dbError } = await supabase
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        patient_id: paymentUserId,
        amount: feeBreakdown.amount,
        currency: feeBreakdown.currency,
        payment_method: paymentMethod,
        status: 'initiated',
        payout_status: 'pending',
        fedapay_transaction_id: transaction.id.toString(),
        fedapay_payment_url: paymentUrl,
        idempotency_key: idempotencyKey,
        commission_amount: feeBreakdown.commissionAmount,
        gateway_fees_amount: feeBreakdown.gatewayFeesAmount,
        fees_amount: feeBreakdown.feesAmount,
        net_amount: feeBreakdown.netAmount,
        hold_until: holdUntil,
        payer_name: payerName,
        payer_email: payerEmail || null,
        payer_phone: phoneNumber
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
      title: 'Paiement initié',
      message: 'Votre paiement a été initié. Veuillez suivre les instructions pour compléter la transaction.',
      userId: paymentUserId,
      type: 'payment',
      link: null
    });

    // Mettre à jour le statut de l'appointment
    await supabase
      .from('appointments')
      .update({ 
        status: 'pending_payment',
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId);

    return new Response(
      JSON.stringify({ 
        success: true,
        paymentId: payment.id,
        transactionId: transaction.id,
        paymentUrl,
        amount: feeBreakdown.amount,
        currency: feeBreakdown.currency
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error in create-payment:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Une erreur inattendue est survenue',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
