import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiagnosticResult {
  payment_id: string;
  appointment_id: string;
  patient_id: string;
  status: string;
  payout_status: string;
  created_at: string;
  age_minutes: number;
  fedapay_transaction_id: string | null;
  fedapay_status?: string;
  issue?: string;
  recommendation?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Starting diagnostic of stuck payments...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Vérifier la configuration FedaPay
    console.log('1️⃣ Checking FedaPay configuration...');
    const { data: fedapayConfig, error: configError } = await supabase.functions.invoke('get-fedapay-config');

    const configStatus = {
      has_public_key: !!fedapayConfig?.publicKey,
      has_secret_key: !!fedapaySecretKey,
      environment: fedapayMode,
      config_loaded: !configError,
    };

    console.log('FedaPay config status:', configStatus);

    // 2. Trouver tous les paiements bloqués
    console.log('2️⃣ Finding stuck payments...');
    const { data: stuckPayments, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .in('status', ['initiated', 'pending'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      throw fetchError;
    }

    if (!stuckPayments || stuckPayments.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stuck payments found',
          config: configStatus,
          stuck_payments_count: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${stuckPayments.length} stuck payments`);

    const fedapayApiUrl = fedapayMode === 'live'
      ? 'https://api.fedapay.com/v1/transactions'
      : 'https://sandbox-api.fedapay.com/v1/transactions';

    const diagnostics: DiagnosticResult[] = [];
    const now = Date.now();

    // 3. Diagnostiquer chaque paiement
    for (const payment of stuckPayments) {
      const createdAt = new Date(payment.created_at);
      const ageMinutes = Math.floor((now - createdAt.getTime()) / 60000);

      const diagnostic: DiagnosticResult = {
        payment_id: payment.id,
        appointment_id: payment.appointment_id,
        patient_id: payment.patient_id,
        status: payment.status,
        payout_status: payment.payout_status,
        created_at: payment.created_at,
        age_minutes: ageMinutes,
        fedapay_transaction_id: payment.fedapay_transaction_id,
      };

      // Déterminer le problème
      if (ageMinutes > 15) {
        diagnostic.issue = 'EXPIRED';
        diagnostic.recommendation = 'Cancel and allow user to create new payment';
      } else if (!payment.fedapay_transaction_id) {
        diagnostic.issue = 'NO_TRANSACTION_ID';
        diagnostic.recommendation = 'Payment creation failed, cancel and retry';
      } else if (!payment.fedapay_payment_url) {
        diagnostic.issue = 'NO_PAYMENT_URL';
        diagnostic.recommendation = 'Token generation failed, cancel and retry';
      }

      // Vérifier le statut sur FedaPay si on a un transaction_id
      if (payment.fedapay_transaction_id) {
        try {
          const fedapayResponse = await fetch(
            `${fedapayApiUrl}/${payment.fedapay_transaction_id}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${fedapaySecretKey}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (fedapayResponse.ok) {
            const fedapayData = await fedapayResponse.json();
            const fedapayTransaction = fedapayData.v1?.transaction || fedapayData;
            diagnostic.fedapay_status = fedapayTransaction.status;

            // Si FedaPay a un statut différent, c'est un problème de synchronisation
            if (fedapayTransaction.status === 'approved' && payment.status !== 'paid') {
              diagnostic.issue = 'SYNC_ISSUE';
              diagnostic.recommendation = 'Webhook not received, run auto-sync';
            } else if (fedapayTransaction.status === 'declined' && payment.status !== 'failed') {
              diagnostic.issue = 'SYNC_ISSUE';
              diagnostic.recommendation = 'Payment declined on FedaPay, update status';
            }
          } else {
            diagnostic.fedapay_status = 'API_ERROR';
            diagnostic.issue = 'FEDAPAY_API_ERROR';
            diagnostic.recommendation = 'FedaPay API not responding, retry later';
          }
        } catch (error) {
          diagnostic.fedapay_status = 'FETCH_ERROR';
          diagnostic.issue = 'FEDAPAY_FETCH_ERROR';
          diagnostic.recommendation = 'Cannot check FedaPay status, network issue';
        }
      }

      diagnostics.push(diagnostic);
    }

    // 4. Générer un rapport
    const report = {
      timestamp: new Date().toISOString(),
      config: configStatus,
      total_stuck_payments: stuckPayments.length,
      diagnostics,
      summary: {
        expired: diagnostics.filter(d => d.issue === 'EXPIRED').length,
        sync_issues: diagnostics.filter(d => d.issue === 'SYNC_ISSUE').length,
        no_transaction_id: diagnostics.filter(d => d.issue === 'NO_TRANSACTION_ID').length,
        no_payment_url: diagnostics.filter(d => d.issue === 'NO_PAYMENT_URL').length,
        fedapay_errors: diagnostics.filter(d => d.issue?.includes('FEDAPAY')).length,
      },
      recommendations: [
        diagnostics.filter(d => d.issue === 'EXPIRED').length > 0
          ? `Cancel ${diagnostics.filter(d => d.issue === 'EXPIRED').length} expired payments`
          : null,
        diagnostics.filter(d => d.issue === 'SYNC_ISSUE').length > 0
          ? `Run auto-sync for ${diagnostics.filter(d => d.issue === 'SYNC_ISSUE').length} payments with sync issues`
          : null,
        diagnostics.filter(d => d.issue === 'NO_TRANSACTION_ID' || d.issue === 'NO_PAYMENT_URL').length > 0
          ? `Cancel ${diagnostics.filter(d => d.issue === 'NO_TRANSACTION_ID' || d.issue === 'NO_PAYMENT_URL').length} incomplete payments`
          : null,
      ].filter(r => r !== null),
    };

    console.log('📊 Diagnostic complete:', report.summary);

    return new Response(
      JSON.stringify(report),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Diagnostic error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
