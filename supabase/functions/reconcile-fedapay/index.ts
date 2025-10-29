import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * EPIC 5: Réconciliation quotidienne FedaPay
 * Compare les transactions FedaPay avec la base de données
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { startDate, endDate } = await req.json();

    console.log('Reconciling FedaPay transactions from', startDate, 'to', endDate);

    // Fetch transactions from FedaPay
    const fedapayUrl = fedapayMode === 'live' 
      ? 'https://api.fedapay.com/v1/transactions'
      : 'https://sandbox-api.fedapay.com/v1/transactions';

    const fedapayResponse = await fetch(
      `${fedapayUrl}?created_at[gte]=${startDate}&created_at[lte]=${endDate}`,
      {
        headers: {
          'Authorization': `Bearer ${fedapaySecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!fedapayResponse.ok) {
      throw new Error(`FedaPay API error: ${fedapayResponse.statusText}`);
    }

    const fedapayData = await fedapayResponse.json();
    const fedapayTransactions = fedapayData.data || [];

    // Fetch payments from DB
    const { data: dbPayments, error: dbError } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (dbError) throw dbError;

    // Compare and find discrepancies
    const discrepancies: any[] = [];
    const fedapayByTxId = new Map(
      fedapayTransactions.map((tx: any) => [tx.id.toString(), tx])
    );

    // Check DB payments against FedaPay
    for (const payment of dbPayments || []) {
      if (payment.fedapay_transaction_id) {
        const fedapayTx: any = fedapayByTxId.get(payment.fedapay_transaction_id);
        
        if (!fedapayTx) {
          discrepancies.push({
            type: 'missing_in_fedapay',
            payment_id: payment.id,
            transaction_id: payment.fedapay_transaction_id,
            amount: payment.amount,
          });
        } else if (fedapayTx.amount && fedapayTx.amount !== payment.amount) {
          discrepancies.push({
            type: 'amount_mismatch',
            payment_id: payment.id,
            transaction_id: payment.fedapay_transaction_id,
            db_amount: payment.amount,
            fedapay_amount: fedapayTx.amount,
          });
        }
      }
    }

    // Check FedaPay transactions against DB
    const dbTxIds = new Set(
      (dbPayments || [])
        .map(p => p.fedapay_transaction_id)
        .filter(Boolean)
    );

    for (const fedapayTx of fedapayTransactions) {
      if (!dbTxIds.has(fedapayTx.id.toString())) {
        discrepancies.push({
          type: 'missing_in_db',
          transaction_id: fedapayTx.id.toString(),
          amount: fedapayTx.amount,
          status: fedapayTx.status,
        });
      }
    }

    // Calculate totals
    const fedapayTotal = fedapayTransactions
      .filter((tx: any) => tx.status === 'approved')
      .reduce((sum: number, tx: any) => sum + tx.amount, 0);

    const dbTotal = (dbPayments || [])
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);

    const report = {
      period: { startDate, endDate },
      fedapay_count: fedapayTransactions.length,
      db_count: dbPayments?.length || 0,
      fedapay_total: fedapayTotal,
      db_total: dbTotal,
      difference: Math.abs(fedapayTotal - dbTotal),
      discrepancies,
      status: discrepancies.length === 0 ? 'OK' : 'DISCREPANCIES',
      reconciled_at: new Date().toISOString(),
    };

    console.log('Reconciliation report:', report);

    return new Response(
      JSON.stringify(report),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in reconcile-fedapay:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
