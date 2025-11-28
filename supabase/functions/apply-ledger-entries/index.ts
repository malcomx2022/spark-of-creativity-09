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

    const { paymentId, status } = await req.json();

    console.log('Applying ledger entries for payment:', paymentId, 'status:', status);

    // Get payment details with practitioner_id
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*, appointment_id')
      .eq('id', paymentId)
      .single();

    if (paymentError || !payment) {
      throw new Error('Payment not found');
    }

    // Déterminer le practitioner_id selon le type de paiement
    let practitionerId: string | null = null;
    
    if (payment.appointment_id && payment.appointment_id.startsWith('group_session_')) {
      // Séance de groupe: group_session_{sessionId}_{participantId}
      console.log('🏋️ Paiement de séance de groupe pour ledger');
      const parts = payment.appointment_id.split('_');
      const sessionId = parts[2];
      
      const { data: sessionData } = await supabase
        .from('group_sessions')
        .select('coach_id')
        .eq('id', sessionId)
        .single();
      
      if (sessionData?.coach_id) {
        practitionerId = sessionData.coach_id;
      }
    } else {
      // Rendez-vous classique
      const { data: appointmentData } = await supabase
        .from('appointments')
        .select('practitioner_id')
        .eq('id', payment.appointment_id)
        .single();
      
      if (appointmentData?.practitioner_id) {
        practitionerId = appointmentData.practitioner_id;
      }
    }

    if (!practitionerId) {
      throw new Error('Practitioner not found for payment');
    }

    // Get or create ledger accounts
    const { data: platformCash } = await supabase
      .from('ledger_accounts')
      .select('id')
      .eq('owner_type', 'platform')
      .eq('account_type', 'cash')
      .single();

    if (!platformCash) {
      throw new Error('Platform cash account not found');
    }

    const { data: platformCommission } = await supabase
      .from('ledger_accounts')
      .select('id')
      .eq('owner_type', 'platform')
      .eq('account_type', 'revenue_commission')
      .single();

    if (!platformCommission) {
      throw new Error('Platform commission account not found');
    }

    const { data: platformFees } = await supabase
      .from('ledger_accounts')
      .select('id')
      .eq('owner_type', 'platform')
      .eq('account_type', 'revenue_fees')
      .single();

    if (!platformFees) {
      throw new Error('Platform fees account not found');
    }

    // Get or create patient obligation account
    const { data: patientObligation } = await supabase
      .from('ledger_accounts')
      .upsert({
        owner_type: 'patient',
        owner_id: payment.patient_id,
        account_type: 'obligation',
        currency: payment.currency
      }, { onConflict: 'owner_type,owner_id,account_type,currency' })
      .select('id')
      .single();

    if (!patientObligation) {
      throw new Error('Failed to create patient obligation account');
    }

    // Get or create practitioner payable account
    const { data: practitionerPayable } = await supabase
      .from('ledger_accounts')
      .upsert({
        owner_type: 'practitioner',
        owner_id: practitionerId,
        account_type: 'payable',
        currency: payment.currency
      }, { onConflict: 'owner_type,owner_id,account_type,currency' })
      .select('id')
      .single();

    if (!practitionerPayable) {
      throw new Error('Failed to create practitioner payable account');
    }

    if (status === 'paid') {
      // Double-entry accounting for paid payment
      const ledgerEntries = [
        // Dr Platform:Cash / Cr Patient:Obligation
        {
          account_id: platformCash.id,
          debit: payment.amount,
          credit: 0,
          currency: payment.currency,
          reference_type: 'payment',
          reference_id: payment.id,
          description: 'Payment received from patient'
        },
        {
          account_id: patientObligation.id,
          debit: 0,
          credit: payment.amount,
          currency: payment.currency,
          reference_type: 'payment',
          reference_id: payment.id,
          description: 'Payment obligation fulfilled'
        },
        // Cr Practitioner:Payable (net amount)
        {
          account_id: practitionerPayable.id,
          debit: 0,
          credit: payment.net_amount,
          currency: payment.currency,
          reference_type: 'payment',
          reference_id: payment.id,
          description: 'Amount payable to practitioner'
        },
        // Cr Platform:RevenuCommission
        {
          account_id: platformCommission.id,
          debit: 0,
          credit: payment.commission_amount,
          currency: payment.currency,
          reference_type: 'payment',
          reference_id: payment.id,
          description: 'Platform commission'
        },
        // Cr Platform:RevenuFees
        {
          account_id: platformFees.id,
          debit: 0,
          credit: payment.gateway_fees_amount,
          currency: payment.currency,
          reference_type: 'payment',
          reference_id: payment.id,
          description: 'Gateway fees revenue'
        }
      ];

      const { error: entriesError } = await supabase
        .from('ledger_entries')
        .insert(ledgerEntries);

      if (entriesError) {
        console.error('Error creating ledger entries:', entriesError);
        throw entriesError;
      }

      // ✅ CORRECTION: Ne pas mettre à jour les balances ici
      // Les balances sont gérées par la RPC update_payment_with_balance appelée depuis le webhook
      // Cette fonction ne fait QUE les écritures comptables (ledger)
      
      console.log('Ledger entries created successfully (balance managed by RPC)');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in apply-ledger-entries:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
