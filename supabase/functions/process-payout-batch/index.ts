import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchNotification } from "../_shared/notifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PayoutItem {
  id: string;
  practitioner_id: string;
  amount: number;
  net_amount: number;
  payment_method: string;
  practitioners: {
    id: string;
    name: string;
    user_id: string;
    phone: string;
    kyc_status: string | null;
  };
}

interface PaymentInfo {
  payment_method: string;
  phone_number: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  account_holder_name: string;
  is_verified: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY');
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate admin
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

    const { data: isAdmin } = await supabase.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { batchId } = await req.json();

    if (!batchId) {
      return new Response(
        JSON.stringify({ error: 'batchId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing payout batch:', batchId);

    // Get batch details
    const { data: batch, error: batchError } = await supabase
      .from('payout_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return new Response(
        JSON.stringify({ error: 'Batch not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // P1 #7: Check for invalid states to prevent double processing
    if (batch.status === 'sent' || batch.status === 'partially_sent') {
      return new Response(
        JSON.stringify({ error: 'Batch already processed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (batch.status === 'processing') {
      return new Response(
        JSON.stringify({ error: 'Batch is currently being processed. Please wait.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (batch.status !== 'queued') {
      return new Response(
        JSON.stringify({ error: `Invalid batch status for processing: ${batch.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // P1 #7: Atomic status update with optimistic locking - only update if still 'queued'
    const { data: updatedBatch, error: updateError } = await supabase
      .from('payout_batches')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', batchId)
      .eq('status', 'queued') // Optimistic locking: only update if still queued
      .select()
      .single();

    if (updateError || !updatedBatch) {
      return new Response(
        JSON.stringify({ error: 'Batch status changed. Please refresh and try again.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // P1 #10: Get all payouts with practitioner validation (including KYC status)
    const { data: payouts, error: payoutsError } = await supabase
      .from('practitioner_payouts')
      .select('*, practitioners!inner(id, name, user_id, phone, kyc_status)')
      .eq('batch_id', batchId);

    if (payoutsError || !payouts || payouts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No payouts found in batch' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      success: [] as string[],
      failed: [] as { practitionerId: string; name: string; error: string }[],
      skipped: [] as { practitionerId: string; name: string; reason: string }[]
    };

    // Process each payout
    for (const payout of payouts as PayoutItem[]) {
      try {
        console.log(`Processing payout for ${payout.practitioners.name}: ${payout.amount} XOF`);

        // P1 #10: Verify practitioner KYC status before processing payout
        if (payout.practitioners.kyc_status !== 'approved') {
          results.skipped.push({
            practitionerId: payout.practitioner_id,
            name: payout.practitioners.name,
            reason: `Statut KYC non approuvé (${payout.practitioners.kyc_status || 'pending'})`
          });
          continue;
        }

        // Get payment info
        const { data: paymentInfo } = await supabase
          .from('practitioner_payment_info')
          .select('*')
          .eq('practitioner_id', payout.practitioner_id)
          .maybeSingle() as { data: PaymentInfo | null };

        if (!paymentInfo) {
          results.skipped.push({
            practitionerId: payout.practitioner_id,
            name: payout.practitioners.name,
            reason: 'Aucune information de paiement configurée'
          });
          continue;
        }

        if (!paymentInfo.is_verified) {
          results.skipped.push({
            practitionerId: payout.practitioner_id,
            name: payout.practitioners.name,
            reason: 'Informations de paiement non vérifiées'
          });
          continue;
        }

        // Determine payment method
        const isMoMo = paymentInfo.payment_method === 'momo' || paymentInfo.payment_method === 'mobile_money';
        const targetPhone = paymentInfo.phone_number || payout.practitioners.phone;

        if (isMoMo && !targetPhone) {
          results.skipped.push({
            practitionerId: payout.practitioner_id,
            name: payout.practitioners.name,
            reason: 'Numéro de téléphone Mobile Money manquant'
          });
          continue;
        }

        if (!isMoMo && (!paymentInfo.bank_account_number || !paymentInfo.bank_name)) {
          results.skipped.push({
            practitionerId: payout.practitioner_id,
            name: payout.practitioners.name,
            reason: 'Informations bancaires manquantes'
          });
          continue;
        }

        // Execute transfer via FedaPay if configured
        let transferId: string | null = null;
        let transferStatus = 'pending';
        let transferError: string | null = null;

        if (fedapaySecretKey) {
          try {
            const fedapayBaseUrl = fedapayMode === 'live' 
              ? 'https://api.fedapay.com' 
              : 'https://sandbox-api.fedapay.com';

            // Determine payout mode
            let payoutMode: string;
            let fedapayPayload: Record<string, unknown>;

            if (isMoMo) {
              // Detect operator from phone number (Benin)
              const cleanPhone = targetPhone!.replace(/\D/g, '');
              const prefix = cleanPhone.slice(-8, -6);
              // MTN: 96, 97, 90, 91 | Moov: 94, 95, 98, 99
              if (['96', '97', '90', '91'].includes(prefix)) {
                payoutMode = 'mtn';
              } else if (['94', '95', '98', '99'].includes(prefix)) {
                payoutMode = 'moov';
              } else {
                payoutMode = 'mtn'; // default
              }

              fedapayPayload = {
                amount: payout.amount,
                currency: { iso: 'XOF' },
                mode: payoutMode,
                customer: {
                  firstname: payout.practitioners.name.split(' ')[0] || 'Praticien',
                  lastname: payout.practitioners.name.split(' ').slice(1).join(' ') || '',
                  phone_number: {
                    number: cleanPhone,
                    country: 'BJ'
                  }
                }
              };
            } else {
              // Bank transfer
              payoutMode = 'bank';
              fedapayPayload = {
                amount: payout.amount,
                currency: { iso: 'XOF' },
                mode: 'bank',
                customer: {
                  firstname: payout.practitioners.name.split(' ')[0] || 'Praticien',
                  lastname: payout.practitioners.name.split(' ').slice(1).join(' ') || '',
                  bank_account: {
                    number: paymentInfo.bank_account_number,
                    bank: paymentInfo.bank_name,
                    holder: paymentInfo.account_holder_name || payout.practitioners.name
                  }
                }
              };
            }

            console.log('Creating FedaPay payout:', JSON.stringify(fedapayPayload));

            const fedapayResponse = await fetch(`${fedapayBaseUrl}/v1/payouts`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${fedapaySecretKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(fedapayPayload)
            });

            const responseText = await fedapayResponse.text();
            console.log('FedaPay response:', fedapayResponse.status, responseText);

            if (fedapayResponse.ok) {
              const fedapayData = JSON.parse(responseText);
              transferId = fedapayData.v1?.payout?.id?.toString() 
                || fedapayData['v1/payout']?.id?.toString()
                || fedapayData.payout?.id?.toString()
                || fedapayData.id?.toString();
              transferStatus = 'sent';
              console.log('✅ FedaPay payout created:', transferId);
            } else {
              try {
                const errorData = JSON.parse(responseText);
                transferError = errorData.message || errorData.error || 'FedaPay transfer failed';
              } catch {
                transferError = `FedaPay error (${fedapayResponse.status})`;
              }
              console.error('❌ FedaPay payout error:', transferError);
              transferStatus = 'pending_manual';
            }
          } catch (fedapayError) {
            console.error('FedaPay API error:', fedapayError);
            transferError = fedapayError instanceof Error ? fedapayError.message : 'Network error';
            transferStatus = 'pending_manual';
          }
        } else {
          console.log('FedaPay not configured - marking for manual processing');
          transferStatus = 'pending_manual';
        }

        // Update payout status
        await supabase
          .from('practitioner_payouts')
          .update({
            status: transferStatus === 'sent' ? 'completed' : 'pending',
            processed_at: transferStatus === 'sent' ? new Date().toISOString() : null,
            transaction_ids: transferId ? [transferId] : null
          })
          .eq('id', payout.id);

        // Update practitioner balance
        await supabase
          .from('practitioner_balances')
          .update({
            last_payout_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('practitioner_id', payout.practitioner_id);

        // Send notification
        await dispatchNotification({
          supabase,
          supabaseUrl,
          serviceRoleKey: supabaseKey,
          userId: payout.practitioners.user_id,
          title: transferStatus === 'sent' ? '💰 Paiement envoyé' : '💰 Paiement en cours',
          message: transferStatus === 'sent' 
            ? `Votre paiement de ${payout.amount.toLocaleString()} XOF a été envoyé. Vous le recevrez sous 24-48h.`
            : `Votre paiement de ${payout.amount.toLocaleString()} XOF est en cours de traitement.`,
          type: 'payout',
          link: '/dashboard/practitioner?tab=revenue',
          channels: ['email', 'push'],
        });

        results.success.push(payout.practitioner_id);

      } catch (error) {
        console.error(`Error processing payout for ${payout.practitioners.name}:`, error);
        results.failed.push({
          practitionerId: payout.practitioner_id,
          name: payout.practitioners.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update batch status
    const finalStatus = results.failed.length === 0 && results.skipped.length === 0
      ? 'sent'
      : results.success.length === 0
        ? 'failed'
        : 'partially_sent';

    await supabase
      .from('payout_batches')
      .update({
        status: finalStatus,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', batchId);

    // Audit log
    await supabase
      .from('admin_audit_logs')
      .insert({
        admin_id: user.id,
        action: 'process_payout_batch',
        entity_type: 'payout_batch',
        entity_id: batchId,
        details: {
          status: finalStatus,
          success_count: results.success.length,
          failed_count: results.failed.length,
          skipped_count: results.skipped.length
        }
      });

    console.log('Batch processing completed:', finalStatus);

    return new Response(
      JSON.stringify({
        success: true,
        batchId,
        status: finalStatus,
        results: {
          successCount: results.success.length,
          failedCount: results.failed.length,
          skippedCount: results.skipped.length,
          failed: results.failed,
          skipped: results.skipped
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-payout-batch:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
