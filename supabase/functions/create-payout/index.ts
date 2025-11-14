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
    if (practitioner.kyc_status !== 'validated') {
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

    // Note: Pour l'instant, on enregistre le payout sans créer réellement le transfert FedaPay
    // car cela nécessite les informations bancaires complètes du praticien
    // TODO: Intégrer l'API FedaPay Transfers quand les infos bancaires seront disponibles

    // Create payout record
    const { data: payout, error: payoutError } = await supabase
      .from('practitioner_payouts')
      .insert({
        practitioner_id: practitionerId,
        amount: payoutAmount,
        net_amount: payoutAmount,
        currency: 'XOF',
        status: 'pending',
        period_start: periodStart,
        period_end: periodEnd,
        payment_method: 'bank_transfer',
        notes: description || `Reversement période ${periodStart} - ${periodEnd}`
      })
      .select()
      .single();

    if (payoutError) {
      throw payoutError;
    }

    console.log('Payout created:', payout.id);

    // Send notification to practitioner
    await dispatchNotification({
      supabase,
      supabaseUrl,
      serviceRoleKey: supabaseKey,
      userId: practitioner.user_id,
      title: 'Reversement initié',
      message: `Un reversement de ${payoutAmount} XOF a été initié pour la période du ${periodStart} au ${periodEnd}. Les fonds arriveront sous 2-3 jours ouvrés.`,
      type: 'payout',
      link: '/dashboard/practitioner',
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
          period: { start: periodStart, end: periodEnd }
        }
      });

    return new Response(
      JSON.stringify({
        payoutId: payout.id,
        transferId: null, // Will be populated when FedaPay integration is complete
        status: 'pending',
        estimatedArrival: '2-3 business days',
        amount: payoutAmount,
        currency: 'XOF'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
