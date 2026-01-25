import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { dispatchNotification } from "../_shared/notifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema
const PayoutRequestSchema = z.object({
  practitionerId: z.string().uuid({ message: "Invalid practitioner ID format" }),
  amount: z.number().positive({ message: "Amount must be positive" }),
  period: z.object({
    start: z.string(),
    end: z.string()
  }).optional(),
  description: z.string().optional()
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
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

    // Parse and validate request
    const payload = await req.json();
    const validationResult = PayoutRequestSchema.safeParse(payload);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { practitionerId, amount, period, description } = validationResult.data;

    console.log('Creating payout for practitioner:', practitionerId);

    // Get practitioner details with bank info
    const { data: practitioner, error: practError } = await supabase
      .from('practitioners')
      .select('id, name, user_id, kyc_status')
      .eq('id', practitionerId)
      .single();

    if (practError || !practitioner) {
      return new Response(
        JSON.stringify({ error: 'Practitioner not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check KYC status
    if (practitioner.kyc_status !== 'approved') {
      return new Response(
        JSON.stringify({ 
          error: 'KYC not completed',
          message: 'Practitioner must complete KYC verification before receiving payouts'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ CORRECTION ERREUR #7: Vérifier que le praticien a configuré son compte de paiement
    const { data: paymentInfo, error: paymentInfoError } = await supabase
      .from('practitioner_payment_info')
      .select('*')
      .eq('practitioner_id', practitionerId)
      .eq('is_verified', true)
      .maybeSingle();

    if (!paymentInfo) {
      console.error('Payment info not configured for practitioner:', practitionerId);
      return new Response(
        JSON.stringify({ 
          error: 'Payment information not configured',
          message: 'Practitioner must configure and verify payment details (Mobile Money or Bank account) before receiving payouts'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate period if not provided
    let periodStart: string;
    let periodEnd: string;
    
    if (period) {
      periodStart = period.start;
      periodEnd = period.end;
    } else {
      const now = new Date();
      periodEnd = now.toISOString().split('T')[0];
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      periodStart = firstDay.toISOString().split('T')[0];
    }

    // Check if payout already exists for this period
    const { data: existingPayout } = await supabase
      .from('practitioner_payouts')
      .select('id')
      .eq('practitioner_id', practitionerId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .in('status', ['pending', 'processing', 'completed'])
      .maybeSingle();

    if (existingPayout) {
      return new Response(
        JSON.stringify({ 
          error: 'Payout already exists',
          message: 'A payout for this period has already been created',
          payoutId: existingPayout.id
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate amount from paid appointments if amount not specified
    let payoutAmount = amount;
    if (!amount) {
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('net_amount')
        .eq('appointment_id', practitionerId)
        .eq('status', 'paid')
        .eq('payout_status', 'ready')
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd);

      if (paymentsError) {
        throw paymentsError;
      }

      payoutAmount = payments?.reduce((sum, p) => sum + (p.net_amount || 0), 0) || 0;

      if (payoutAmount === 0) {
        return new Response(
          JSON.stringify({ 
            error: 'No funds available',
            message: 'No payments ready for payout in this period'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create FedaPay transfer
    console.log('Creating FedaPay transfer for amount:', payoutAmount);

    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    const fedapayBaseUrl = fedapayMode === 'live' 
      ? 'https://api.fedapay.com' 
      : 'https://sandbox-api.fedapay.com';

    // Determine payout mode based on payment info
    const isMoMo = paymentInfo.payment_method === 'momo' || paymentInfo.payment_method === 'mobile_money';
    
    // Get phone number for MoMo or practitioner's phone
    const { data: practitionerProfile } = await supabase
      .from('practitioners')
      .select('phone')
      .eq('id', practitionerId)
      .single();
    
    const targetPhone = paymentInfo.phone_number || practitionerProfile?.phone;
    
    // Validate required fields for payout
    if (isMoMo && !targetPhone) {
      return new Response(
        JSON.stringify({ 
          error: 'Phone number required',
          message: 'Mobile Money payouts require a valid phone number'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!isMoMo && (!paymentInfo.bank_account_number || !paymentInfo.bank_name)) {
      return new Response(
        JSON.stringify({ 
          error: 'Bank details required',
          message: 'Bank payouts require account number and bank name'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build FedaPay payout payload
    // FedaPay Payout API documentation: https://docs.fedapay.com/api/#payouts
    let fedapayPayload: Record<string, unknown>;
    let payoutMode: string;
    
    if (isMoMo) {
      // Detect operator from phone number (Benin)
      const cleanPhone = targetPhone!.replace(/\D/g, '');
      // MTN: 96, 97, 90, 91 | Moov: 94, 95, 98, 99 | Celtiis: 92, 93
      const prefix = cleanPhone.slice(-8, -6);
      if (['96', '97', '90', '91'].includes(prefix)) {
        payoutMode = 'mtn';
      } else if (['94', '95', '98', '99'].includes(prefix)) {
        payoutMode = 'moov';
      } else {
        payoutMode = 'mtn'; // default to MTN
      }
      
      fedapayPayload = {
        amount: payoutAmount,
        currency: { iso: 'XOF' },
        mode: payoutMode,
        customer: {
          firstname: practitioner.name.split(' ')[0] || 'Praticien',
          lastname: practitioner.name.split(' ').slice(1).join(' ') || '',
          phone_number: {
            number: cleanPhone,
            country: 'BJ' // Benin
          }
        }
      };
    } else {
      // Bank transfer
      payoutMode = 'bank';
      fedapayPayload = {
        amount: payoutAmount,
        currency: { iso: 'XOF' },
        mode: 'bank',
        customer: {
          firstname: practitioner.name.split(' ')[0] || 'Praticien',
          lastname: practitioner.name.split(' ').slice(1).join(' ') || '',
          bank_account: {
            number: paymentInfo.bank_account_number,
            bank: paymentInfo.bank_name,
            holder: paymentInfo.account_holder_name || practitioner.name
          }
        }
      };
    }

    console.log('FedaPay payout payload:', JSON.stringify(fedapayPayload, null, 2));

    // Execute FedaPay transfer
    let transferId: string | null = null;
    let transferStatus = 'pending';
    let transferError: string | null = null;

    try {
      const fedapayResponse = await fetch(`${fedapayBaseUrl}/v1/payouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fedapayPayload)
      });

      const responseText = await fedapayResponse.text();
      console.log('FedaPay response status:', fedapayResponse.status);
      console.log('FedaPay response:', responseText);

      if (fedapayResponse.ok) {
        const fedapayData = JSON.parse(responseText);
        // Extract payout ID from various response formats
        transferId = fedapayData.v1?.payout?.id?.toString() 
          || fedapayData['v1/payout']?.id?.toString()
          || fedapayData.payout?.id?.toString()
          || fedapayData.id?.toString()
          || null;
        
        transferStatus = 'processing';
        console.log('✅ FedaPay payout created successfully:', transferId);
      } else {
        // Parse error
        try {
          const errorData = JSON.parse(responseText);
          transferError = errorData.message || errorData.error || 'FedaPay transfer failed';
        } catch {
          transferError = `FedaPay error (${fedapayResponse.status}): ${responseText.substring(0, 200)}`;
        }
        console.error('❌ FedaPay payout failed:', transferError);
        transferStatus = 'failed';
      }
    } catch (fedapayError) {
      transferError = fedapayError instanceof Error ? fedapayError.message : 'Network error';
      console.error('❌ FedaPay API error:', fedapayError);
      transferStatus = 'failed';
    }

    // Create payout record
    const { data: payout, error: payoutError } = await supabase
      .from('practitioner_payouts')
      .insert({
        practitioner_id: practitionerId,
        amount: payoutAmount,
        net_amount: payoutAmount,
        currency: 'XOF',
        status: transferStatus === 'processing' ? 'processing' : 'failed',
        period_start: periodStart,
        period_end: periodEnd,
        payment_method: payoutMode,
        transaction_ids: transferId ? [transferId] : null,
        notes: description || `Reversement période ${periodStart} - ${periodEnd}`,
        error_message: transferError
      })
      .select()
      .single();

    if (payoutError) {
      throw payoutError;
    }

    console.log('Payout created:', payout.id);

    // If transfer was successful, update practitioner balance
    if (transferStatus === 'processing' && transferId) {
      // Deduct from available balance
      await supabase
        .from('practitioner_balances')
        .update({
          balance_available: 0, // Will be recalculated properly
          updated_at: new Date().toISOString()
        })
        .eq('practitioner_id', practitionerId);
      
      // Mark related payments as paid out
      const { error: markError } = await supabase
        .from('payments')
        .update({ 
          payout_status: 'paid_out',
          updated_at: new Date().toISOString()
        })
        .eq('status', 'paid')
        .eq('payout_status', 'ready')
        .in('appointment_id', (
          await supabase
            .from('appointments')
            .select('id')
            .eq('practitioner_id', practitionerId)
        ).data?.map(a => a.id) || []);
      
      if (markError) {
        console.warn('Warning: Could not mark payments as paid_out:', markError);
      }
    }

    // Send notification to practitioner
    const notificationMessage = transferStatus === 'processing'
      ? `Un reversement de ${payoutAmount.toLocaleString()} XOF a été initié vers votre compte ${payoutMode === 'mtn' ? 'MTN MoMo' : payoutMode === 'moov' ? 'Moov Money' : 'bancaire'}. Les fonds arriveront sous 24-48h.`
      : `Le reversement de ${payoutAmount.toLocaleString()} XOF a échoué: ${transferError}. Veuillez vérifier vos informations de paiement.`;

    await dispatchNotification({
      supabase,
      supabaseUrl,
      serviceRoleKey: supabaseKey,
      userId: practitioner.user_id,
      title: transferStatus === 'processing' ? '💰 Reversement en cours' : '❌ Échec du reversement',
      message: notificationMessage,
      type: 'payout',
      link: '/dashboard/practitioner?tab=payouts',
      channels: ['email', 'push'],
    });

    // Log audit
    await supabase
      .from('admin_audit_logs')
      .insert({
        admin_id: user.id,
        action: 'create_payout',
        entity_type: 'payout',
        entity_id: payout.id,
        details: {
          practitioner_id: practitionerId,
          practitioner_name: practitioner.name,
          amount: payoutAmount,
          period: { start: periodStart, end: periodEnd },
          transfer_id: transferId,
          transfer_status: transferStatus,
          payout_mode: payoutMode,
          error: transferError
        }
      });

    return new Response(
      JSON.stringify({
        payoutId: payout.id,
        transferId: transferId,
        status: transferStatus,
        estimatedArrival: transferStatus === 'processing' ? '24-48 hours' : null,
        amount: payoutAmount,
        currency: 'XOF',
        error: transferError
      }),
      { status: transferStatus === 'processing' ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-payout:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
