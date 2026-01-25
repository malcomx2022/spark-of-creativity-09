import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { parseFedaPayResponse } from "./utils.ts";
import { calculateFees, parseFeeConfig, calculateHoldUntil } from "./fee-calculator.ts";
import { normalizeStatus } from "./payment-status.ts";
import { dispatchNotification } from "../_shared/notifications.ts";
import { fetchWithTimeout } from "./fetch-with-timeout.ts";

const DEFAULT_APPOINTMENT_AMOUNT = 10000;

// Validation schema avec Zod
// ✅ CORRECTION: Accepter UUID standard OU format group_session_{uuid}_{uuid}
const appointmentIdSchema = z.string().refine(
  (val) => {
    // UUID standard
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Format séance de groupe: group_session_{sessionId}_{participantId}
    const groupSessionRegex = /^group_session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(val) || groupSessionRegex.test(val);
  },
  { message: "Format d'identifiant invalide (UUID ou group_session_{uuid}_{uuid} attendu)" }
);

const PaymentRequestSchema = z.object({
  appointmentId: appointmentIdSchema,
  amount: z.number()
    .min(100, { message: "Le montant doit être d'au moins 100 XOF" })
    .max(1000000, { message: "Le montant ne doit pas dépasser 1 000 000 XOF" })
    .optional(),
  paymentMethod: z.enum(['mtn', 'moov'], {
    errorMap: () => ({ message: "La méthode de paiement doit être 'mtn' ou 'moov'" })
  }),
  phoneNumber: z.string()
    .regex(/^\+229(01)?\d{8}$/, { 
      message: "Le numéro doit être au format béninois : +229XXXXXXXX ou +2290101XXXXXXXX" 
    }),
  payerName: z.string().min(2, { message: "Le nom du payeur doit contenir au moins 2 caractères" }),
  payerEmail: z.string().email({ message: "Format d'email invalide" }).optional(),
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

    // ✅ CORRECTION: Gérer différemment les séances de groupe et les rendez-vous classiques
    const isGroupSession = appointmentId.startsWith('group_session_');
    const paymentUserId = requestBypassAuth && requestPatientId ? requestPatientId : user!.id;
    let amountToCharge: number;

    if (isGroupSession) {
      // 🏋️ SÉANCE DE GROUPE
      console.log('🏋️ Paiement de séance de groupe détecté');
      const parts = appointmentId.split('_');
      const sessionId = parts[2];
      const participantId = parts[3];

      // Vérifier que la séance existe
      const { data: sessionData, error: sessionError } = await supabase
        .from('group_sessions')
        .select('id, price_per_person, status, coach_id')
        .eq('id', sessionId)
        .single();

      if (sessionError || !sessionData) {
        console.error('Group session not found:', sessionError);
        return new Response(
          JSON.stringify({ error: 'Séance de groupe non trouvée' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Vérifier que le participant existe et appartient à l'utilisateur
      const { data: participantData, error: participantError } = await supabase
        .from('group_session_participants')
        .select('id, patient_id, payment_status')
        .eq('id', participantId)
        .single();

      if (participantError || !participantData) {
        console.error('Participant not found:', participantError);
        return new Response(
          JSON.stringify({ error: 'Inscription non trouvée' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!bypassAuth && participantData.patient_id !== paymentUserId) {
        console.error('Unauthorized access to group session');
        return new Response(
          JSON.stringify({ error: 'Vous n\'êtes pas autorisé à payer pour cette inscription' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Vérifier que le paiement n'est pas déjà effectué
      if (participantData.payment_status === 'paid') {
        return new Response(
          JSON.stringify({ error: 'Cette inscription est déjà payée' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      amountToCharge = requestedAmount ?? sessionData.price_per_person;
      console.log('Group session payment:', { sessionId, participantId, amountToCharge });

    } else {
      // 📋 RENDEZ-VOUS CLASSIQUE
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

      if (!bypassAuth && appointment.patient_id !== paymentUserId) {
        console.error('Unauthorized access to appointment');
        return new Response(
          JSON.stringify({ error: 'Vous n\'êtes pas autorisé à payer pour ce rendez-vous' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const payableStatuses = ['confirmed', 'pending_payment', 'pending'];
      if (!payableStatuses.includes(appointment.status)) {
        console.error('Appointment not in a payable state:', appointment.status);
        return new Response(
          JSON.stringify({ 
            error: 'Ce rendez-vous n\'est pas dans un état payable',
            currentStatus: appointment.status,
            allowedStatuses: payableStatuses
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      amountToCharge = requestedAmount ?? appointment.payment_amount ?? DEFAULT_APPOINTMENT_AMOUNT;
    }

    // ✅ CORRECTION P2 #1: Vérifier que le montant n'est pas nul ou invalide
    if (!amountToCharge || amountToCharge <= 0 || isNaN(amountToCharge)) {
      console.error('Invalid payment amount:', amountToCharge);
      return new Response(
        JSON.stringify({ 
          error: 'Montant de paiement invalide. Veuillez contacter le support.',
          details: { amountToCharge }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Payment initiated:', { appointmentId, amountToCharge, paymentMethod, phoneNumber, isGroupSession });

    // ✅ CORRECTION CRITIQUE #3: Récupérer practitioner_id AVANT de créer la transaction FedaPay
    let practitionerId: string | null = null;
    
    if (appointmentId.startsWith('group_session_')) {
      // Format: group_session_{sessionId}_{participantId}
      console.log('🏋️ Paiement de séance de groupe détecté');
      const parts = appointmentId.split('_');
      const sessionId = parts[2]; // group_session_{sessionId}_{participantId}
      
      // Récupérer le coach_id depuis group_sessions
      const { data: sessionData, error: sessionError } = await supabase
        .from('group_sessions')
        .select('coach_id')
        .eq('id', sessionId)
        .single();
      
      if (sessionError) {
        console.error('Error fetching group session:', sessionError);
        return new Response(
          JSON.stringify({ error: 'Séance de groupe non trouvée' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!sessionData?.coach_id) {
        console.error('Coach not found for group session:', sessionId);
        return new Response(
          JSON.stringify({ error: 'Coach non trouvé pour cette séance' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      practitionerId = sessionData.coach_id;
      console.log('Coach ID récupéré:', practitionerId);
    } else {
      // Rendez-vous classique
      const { data: appointmentData, error: appointmentError } = await supabase
        .from('appointments')
        .select('practitioner_id')
        .eq('id', appointmentId)
        .single();
      
      if (appointmentError) {
        console.error('Error fetching appointment:', appointmentError);
        return new Response(
          JSON.stringify({ error: 'Rendez-vous non trouvé' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!appointmentData?.practitioner_id) {
        console.error('Practitioner not found for appointment:', appointmentId);
        return new Response(
          JSON.stringify({ error: 'Praticien non trouvé pour ce rendez-vous' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      practitionerId = appointmentData.practitioner_id;
      console.log('Practitioner ID récupéré:', practitionerId);
    }
    
    if (!practitionerId) {
      console.error('No practitioner_id found for payment');
      return new Response(
        JSON.stringify({ error: 'Praticien non trouvé, impossible de créer le paiement' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ CORRECTION P0 #3: Idempotency key avec crypto.randomUUID() au lieu de Date.now()
    // Date.now() peut créer des collisions en cas de requêtes simultanées
    const idempotencyKey = `${appointmentId}-${crypto.randomUUID()}`;

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
      const PAYMENT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes pour améliorer l'UX
      
      // ✅ CORRECTION RACE CONDITION: Si bypassAuth=true (appel depuis handle-appointment-response),
      // nettoyer automatiquement les anciens paiements pour éviter le 409
      if (bypassAuth) {
        console.log('🧹 BypassAuth detected - force cleaning existing payment:', existingPayment.id);
        await supabase
          .from('payments')
          .update({ 
            status: 'failed',
            payout_status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPayment.id);
        
        console.log('✅ Old payment cleaned, proceeding with new payment');
      }
      // Si le paiement a plus de 2 minutes, le marquer comme expiré
      else if (paymentAge > PAYMENT_TIMEOUT_MS) {
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
        // Paiement récent d'un vrai utilisateur, bloquer la création
        const remainingMinutes = Math.ceil((PAYMENT_TIMEOUT_MS - paymentAge) / 60000);
        console.log('Existing pending payment found:', existingPayment);
        return new Response(
          JSON.stringify({ 
            error: `⏳ Un paiement est en cours de traitement.\n\nVeuillez patienter ${remainingMinutes} minute(s) ou cliquez sur "Annuler et réessayer" pour créer un nouveau paiement.`,
            paymentId: existingPayment.id,
            retryAfter: remainingMinutes,
            existingPaymentStatus: existingPayment.status,
            message: `Si vous avez fermé la fenêtre de paiement par erreur, patientez ${remainingMinutes} minute(s) ou annulez ce paiement pour recommencer.`
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Map payment methods to FedaPay modes
    const modeMap: Record<string, string> = {
      'mtn': 'mtn_benin',
      'moov': 'moov_benin'
    };

    const selectedMode = modeMap[paymentMethod];
    if (!selectedMode) {
      console.error('Unsupported payment method requested:', paymentMethod);
      return new Response(
        JSON.stringify({ error: 'Méthode de paiement non supportée' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('💳 Méthode de paiement sélectionnée:', {
      demandée: paymentMethod,
      modeFedaPay: selectedMode,
      montant: amountToCharge,
      téléphone: phoneNumber
    });

    // FedaPay base URL
    const fedapayBaseUrl = Deno.env.get('FEDAPAY_MODE') === 'live' 
      ? 'https://api.fedapay.com' 
      : 'https://sandbox-api.fedapay.com';

    const isProduction = Deno.env.get('FEDAPAY_MODE') === 'live';

    // URL de base de l'application (pour le callback après paiement)
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://domicares.life';

    // Préparer les informations du client pour FedaPay
    const nameParts = payerName.trim().split(/\s+/);
    const firstname = nameParts[0] || 'Patient';
    const lastname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Domicares';
    const customerEmail = payerEmail || `patient-${paymentUserId}@domicares.app`;

    console.log(`🔧 Configuration FedaPay:`, {
      mode: isProduction ? 'PRODUCTION' : 'SANDBOX',
      baseUrl: fedapayBaseUrl,
      montant: amountToCharge,
      méthode: selectedMode,
      téléphone: phoneNumber.substring(0, 8) + '***' // Masquer les derniers chiffres pour la sécurité
    });

    // ÉTAPE 1: Créer la transaction FedaPay selon la documentation officielle
    
    if (!isProduction) {
      console.log('📝 Étape 1 : Création de la transaction FedaPay');
      console.log('⚠️  MODE SANDBOX : Utilisez uniquement ces numéros de test :');
      console.log('   ✅ MTN succès: +229 66 00 00 01');
      console.log('   ✅ MOOV succès: +229 64 00 00 01');
      console.log('   ❌ Échec simulé: +229 66 00 00 00 ou +229 64 00 00 00');
      console.log('Détails transaction:', { 
        montant: amountToCharge, 
        mode: selectedMode,
        client: { prenom: firstname, nom: lastname }
      });
    } else {
      console.log('📝 Étape 1 : Création de la transaction FedaPay', { appointmentId });
    }
    
    // ✅ CORRECTION CRITIQUE #2: Ajouter timeout de 30 secondes
    const createTransactionResponse = await fetchWithTimeout(
      `${fedapayBaseUrl}/v1/transactions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: isGroupSession 
            ? `Paiement séance de groupe #${appointmentId.split('_')[2]}`
            : `Paiement rendez-vous médical #${appointmentId}`,
          amount: amountToCharge,
          currency: {
            iso: 'XOF'
          },
          // notify_url: webhook serveur pour suivi des statuts (appelé par FedaPay)
          notify_url: `${supabaseUrl}/functions/v1/payment-webhook`,
          // callback_url: redirection client après paiement (FedaPay ajoutera transaction_id automatiquement)
          callback_url: `${appBaseUrl}/payment/callback?appointment_id=${appointmentId}`,
          customer: {
            firstname,
            lastname,
            email: customerEmail,
            phone_number: {
              number: phoneNumber.replace(/^\+229/, ''), // Retirer +229 pour sandbox
              country: 'bj' // ✅ CORRECTION: Minuscules requis par FedaPay
            }
          },
          custom_metadata: {
            appointment_id: appointmentId,
            user_id: paymentUserId,
            payment_method: paymentMethod,
            payer_name: payerName,
            payer_email: payerEmail || null
          }
        }),
      },
      30000 // Timeout de 30 secondes
    );

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
    
    // ✅ AMÉLIORATION #5: Logs sans données sensibles en production
    if (isProduction) {
      console.log('✅ Étape 1 Terminée : Transaction créée', {
        transactionId: fedapayData.v1_transaction?.id || fedapayData['v1/transaction']?.id
      });
    } else {
      console.log('FedaPay transaction created successfully:', fedapayData);
      console.log('✅ Étape 1 Terminée : Transaction créée');
    }

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
    if (!isProduction) {
      console.log('🔑 Étape 2 : Génération du token de paiement');
      console.log('Step 2: Generating payment token for transaction:', transaction.id);
    } else {
      console.log('🔑 Étape 2 : Génération du token', { transactionId: transaction.id });
    }
    
    // ✅ CORRECTION CRITIQUE #2: Ajouter timeout de 30 secondes
    const generateTokenResponse = await fetchWithTimeout(
      `${fedapayBaseUrl}/v1/transactions/${transaction.id}/token`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: selectedMode
        })
      },
      30000 // Timeout de 30 secondes
    );

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
    
    // ✅ AMÉLIORATION #5: Logs sans données sensibles en production
    if (isProduction) {
      console.log('✅ Étape 2 Terminée : Token généré');
    } else {
      console.log('FedaPay token generated successfully:', tokenData);
      console.log('✅ Étape 2 Terminée : Token généré avec succès');
    }
    
    // FedaPay retourne directement { token: "...", url: "..." }
    const paymentToken = tokenData.token;
    const paymentUrl = tokenData.url;
    
    if (!paymentToken || !paymentUrl) {
      console.error('Payment token or URL not found in response');
      return new Response(
        JSON.stringify({ 
          error: 'Token ou URL de paiement non disponible',
          details: { hasToken: !!paymentToken, hasUrl: !!paymentUrl }
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!isProduction) {
      console.log('Payment URL extracted:', paymentUrl);
    }

    // ÉTAPE 3: Le paiement est prêt, le patient recevra le lien par notification
    console.log('✅ Étape 3 : Transaction et token créés, paiement prêt pour le patient');

    // Récupérer la configuration des frais avec fallback si table inexistante
    let systemConfig: Record<string, any> = {};
    try {
      const { data: configData, error: configError } = await supabase
        .from('system_config')
        .select('key, value')
        .in('key', [
          'payment_commission_rate',
          'payment_gateway_fees',
          'payment_rounding_mode',
          'payment_hold_period_days'
        ]);
      
      if (!configError && configData) {
        configData.forEach(row => {
          systemConfig[row.key] = row.value;
        });
      } else {
        console.warn('⚠️ system_config non disponible, utilisation des valeurs par défaut:', configError?.message);
      }
    } catch (configErr) {
      console.warn('⚠️ Erreur accès system_config, utilisation des valeurs par défaut:', configErr);
    }
    
    // Valeurs par défaut sécurisées si config non disponible
    const defaultConfig = {
      payment_commission_rate: { rate: 0.05 }, // 5%
      payment_gateway_fees: { percentage: 0.015, fixed: 100, paid_by: 'platform' as const }, // 1.5% + 100 XOF
      payment_rounding_mode: { decimals: 2 },
      payment_hold_period_days: { days: 2 }
    };
    
    // Fusionner avec les valeurs par défaut
    const mergedConfig = { ...defaultConfig, ...systemConfig };
    
    // Calculer les frais
    const feeConfig = parseFeeConfig(mergedConfig);
    const feeBreakdown = calculateFees(amountToCharge, 'XOF', feeConfig);
    const holdPeriodDays = mergedConfig.payment_hold_period_days?.days || 2;
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

    // ✅ CORRECTION: Ne PAS initialiser la balance ici
    // La balance sera mise à jour uniquement par le webhook lors de la confirmation du paiement
    // Cela évite d'incrémenter balance_pending avant que le paiement soit réellement confirmé
    if (practitionerId) {
      console.log('Practitioner ID for this payment:', practitionerId);
      console.log('⏳ Balance will be updated by webhook on payment confirmation (not here)');
    } else {
      console.warn('⚠️ Aucun practitioner_id trouvé pour ce paiement:', appointmentId);
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

    // ✅ CORRECTION: Mettre à jour le statut selon le type (appointment vs group_session)
    if (isGroupSession) {
      // Pour les séances de groupe, le participant est déjà créé avec payment_status='pending'
      // Pas besoin de mise à jour ici, le webhook s'en chargera
      console.log('Group session payment initiated, waiting for webhook confirmation');
    } else {
      // Mettre à jour le statut de l'appointment classique
      await supabase
        .from('appointments')
        .update({ 
          status: 'pending_payment',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);
    }

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
