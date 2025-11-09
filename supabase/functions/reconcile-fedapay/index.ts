import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { dispatchNotification, getUsersWithRoles } from "../_shared/notifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FedaPayTransaction {
  id: number;
  reference: string;
  amount: number;
  status: string;
  created_at: string;
  description?: string;
}

interface Anomaly {
  type: 'missing_in_db' | 'missing_in_fedapay' | 'amount_mismatch' | 'status_mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  fedapay_transaction_id?: string;
  db_payment_id?: string;
  fedapay_amount?: number;
  db_amount?: number;
  fedapay_status?: string;
  db_status?: string;
  description: string;
  recommendation: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting FedaPay reconciliation...');

    // Get credentials
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      throw new Error('Unauthorized: Admin access required');
    }

    // Parse request body
    const { period_start, period_end } = await req.json();
    const startDate = new Date(period_start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const endDate = new Date(period_end || new Date());

    console.log(`Reconciling period: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Create reconciliation report
    const { data: report, error: reportError } = await supabase
      .from('reconciliation_reports')
      .insert({
        created_by: user.id,
        period_start: startDate.toISOString(),
        period_end: endDate.toISOString(),
        status: 'in_progress',
      })
      .select()
      .single();

    if (reportError) throw reportError;

    // Fetch FedaPay transactions
    console.log('Fetching FedaPay transactions...');
    const fedapayResponse = await fetch('https://api.fedapay.com/v1/transactions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${fedapaySecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!fedapayResponse.ok) {
      throw new Error(`FedaPay API error: ${fedapayResponse.statusText}`);
    }

    const fedapayData = await fedapayResponse.json();
    const fedapayTransactions: FedaPayTransaction[] = fedapayData.v1?.transactions || [];
    
    // Filter transactions by period
    const filteredFedapay = fedapayTransactions.filter((tx: FedaPayTransaction) => {
      const txDate = new Date(tx.created_at);
      return txDate >= startDate && txDate <= endDate;
    });

    console.log(`Found ${filteredFedapay.length} FedaPay transactions in period`);

    // Fetch database payments
    const { data: dbPayments, error: paymentsError } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (paymentsError) throw paymentsError;

    console.log(`Found ${dbPayments?.length || 0} database payments in period`);

    // Perform reconciliation
    const anomalies: Anomaly[] = [];
    const matched = new Set<string>();
    let totalAmountDiscrepancy = 0;

    // Create maps for faster lookups
    const fedapayMap = new Map(
      filteredFedapay.map(tx => [tx.id.toString(), tx])
    );
    const dbPaymentsMap = new Map(
      (dbPayments || []).map(p => [p.fedapay_transaction_id, p])
    );

    // Check for missing transactions in DB
    for (const fedapayTx of filteredFedapay) {
      const dbPayment = dbPaymentsMap.get(fedapayTx.id.toString());

      if (!dbPayment) {
        anomalies.push({
          type: 'missing_in_db',
          severity: 'high',
          fedapay_transaction_id: fedapayTx.id.toString(),
          fedapay_amount: fedapayTx.amount,
          fedapay_status: fedapayTx.status,
          description: `Transaction FedaPay ${fedapayTx.id} (${fedapayTx.amount} XOF) n'existe pas dans la base de données`,
          recommendation: 'Créer manuellement le paiement dans la base de données ou vérifier si la transaction a été annulée',
        });
      } else {
        matched.add(fedapayTx.id.toString());

        // Check for amount mismatch
        if (fedapayTx.amount !== dbPayment.amount) {
          const discrepancy = Math.abs(fedapayTx.amount - dbPayment.amount);
          totalAmountDiscrepancy += discrepancy;
          anomalies.push({
            type: 'amount_mismatch',
            severity: discrepancy > 1000 ? 'critical' : 'medium',
            fedapay_transaction_id: fedapayTx.id.toString(),
            db_payment_id: dbPayment.id,
            fedapay_amount: fedapayTx.amount,
            db_amount: dbPayment.amount,
            description: `Écart de montant: FedaPay=${fedapayTx.amount} XOF, DB=${dbPayment.amount} XOF (différence: ${discrepancy} XOF)`,
            recommendation: 'Vérifier la source de l\'écart et corriger le montant dans la base de données',
          });
        }

        // Check for status mismatch
        const fedapayStatusMap: Record<string, string> = {
          'approved': 'paid',
          'pending': 'pending',
          'failed': 'failed',
          'canceled': 'canceled',
        };
        const expectedDbStatus = fedapayStatusMap[fedapayTx.status] || fedapayTx.status;
        
        if (expectedDbStatus !== dbPayment.status) {
          anomalies.push({
            type: 'status_mismatch',
            severity: 'medium',
            fedapay_transaction_id: fedapayTx.id.toString(),
            db_payment_id: dbPayment.id,
            fedapay_status: fedapayTx.status,
            db_status: dbPayment.status,
            description: `Incohérence de statut: FedaPay=${fedapayTx.status}, DB=${dbPayment.status}`,
            recommendation: 'Mettre à jour le statut dans la base de données pour correspondre à FedaPay',
          });
        }
      }
    }

    // Check for payments in DB missing from FedaPay
    for (const dbPayment of (dbPayments || [])) {
      if (dbPayment.fedapay_transaction_id && !fedapayMap.has(dbPayment.fedapay_transaction_id)) {
        anomalies.push({
          type: 'missing_in_fedapay',
          severity: 'high',
          db_payment_id: dbPayment.id,
          db_amount: dbPayment.amount,
          db_status: dbPayment.status,
          description: `Paiement DB ${dbPayment.id} référence une transaction FedaPay ${dbPayment.fedapay_transaction_id} qui n'existe pas`,
          recommendation: 'Vérifier si la transaction FedaPay a été supprimée ou si l\'ID est incorrect',
        });
      }
    }

    // Generate recommendations
    const recommendations = generateRecommendations(anomalies);

    // Update report with results
    const { error: updateError } = await supabase
      .from('reconciliation_reports')
      .update({
        status: 'completed',
        total_fedapay_transactions: filteredFedapay.length,
        total_db_payments: dbPayments?.length || 0,
        matched_count: matched.size,
        missing_in_db_count: anomalies.filter(a => a.type === 'missing_in_db').length,
        missing_in_fedapay_count: anomalies.filter(a => a.type === 'missing_in_fedapay').length,
        amount_mismatch_count: anomalies.filter(a => a.type === 'amount_mismatch').length,
        status_mismatch_count: anomalies.filter(a => a.type === 'status_mismatch').length,
        total_amount_discrepancy: totalAmountDiscrepancy,
        anomalies: anomalies,
        recommendations: recommendations,
        completed_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    if (updateError) throw updateError;

    console.log(`Reconciliation completed: ${matched.size} matched, ${anomalies.length} anomalies found`);

    if (anomalies.length > 0) {
      const adminRecipients = await getUsersWithRoles(supabase, ['finance', 'ops', 'compliance']);
      if (adminRecipients.length > 0) {
        const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
        const highCount = anomalies.filter(a => a.severity === 'high').length;
        const summaryDetails = criticalCount > 0
          ? `${criticalCount} anomalie(s) critique(s)`
          : highCount > 0
            ? `${highCount} anomalie(s) majeure(s)`
            : `${anomalies.length} anomalie(s)`;
        const message = `Réconciliation FedaPay du ${startDate.toISOString().slice(0, 10)} au ${endDate.toISOString().slice(0, 10)}: ${summaryDetails} détectée(s). Rapport #${report.id}.`;

        for (const adminId of adminRecipients) {
          await dispatchNotification({
            supabase,
            supabaseUrl,
            serviceRoleKey: supabaseServiceKey,
            userId: adminId,
            title: 'Anomalies de réconciliation détectées',
            message,
            type: 'reconciliation',
            link: '/admin?tab=finance',
            channels: ['email', 'sms', 'push'],
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        report_id: report.id,
        summary: {
          total_fedapay_transactions: filteredFedapay.length,
          total_db_payments: dbPayments?.length || 0,
          matched_count: matched.size,
          anomalies_count: anomalies.length,
          total_amount_discrepancy: totalAmountDiscrepancy,
        },
        anomalies: anomalies,
        recommendations: recommendations,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Reconciliation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: (error as Error).message 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function generateRecommendations(anomalies: Anomaly[]): string[] {
  const recommendations: string[] = [];

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const highCount = anomalies.filter(a => a.severity === 'high').length;
  const missingInDb = anomalies.filter(a => a.type === 'missing_in_db').length;
  const missingInFedapay = anomalies.filter(a => a.type === 'missing_in_fedapay').length;
  const amountMismatches = anomalies.filter(a => a.type === 'amount_mismatch').length;

  if (criticalCount > 0) {
    recommendations.push(`🚨 ${criticalCount} anomalie(s) critique(s) détectée(s). Action immédiate requise.`);
  }

  if (missingInDb > 0) {
    recommendations.push(`⚠️ ${missingInDb} transaction(s) FedaPay non enregistrée(s) dans la base. Synchroniser les webhooks ou créer manuellement les paiements.`);
  }

  if (missingInFedapay > 0) {
    recommendations.push(`⚠️ ${missingInFedapay} paiement(s) en base référencent des transactions FedaPay inexistantes. Vérifier les ID de transaction.`);
  }

  if (amountMismatches > 0) {
    recommendations.push(`💰 ${amountMismatches} écart(s) de montant détecté(s). Vérifier les frais et commissions.`);
  }

  if (anomalies.length === 0) {
    recommendations.push('✅ Aucune anomalie détectée. Tous les paiements sont cohérents entre FedaPay et la base de données.');
  } else {
    recommendations.push(`📊 Total: ${anomalies.length} anomalie(s) à traiter.`);
  }

  return recommendations;
}
