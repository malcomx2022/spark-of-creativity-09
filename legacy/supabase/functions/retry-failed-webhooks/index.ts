import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchNotification, getUsersWithRoles } from "../_shared/notifications.ts";

const MAX_RETRIES = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map FedaPay status to normalized status
const statusMap: Record<string, string> = {
  'pending': 'pending',
  'processing': 'pending',
  'authorized': 'authorized',
  'approved': 'paid',
  'declined': 'failed',
  'canceled': 'canceled',
  'refunded': 'refunded',
  'timeout': 'failed',
};

/**
 * Traite directement le webhook sans rappeler payment-webhook
 * (évite le problème de signature)
 */
async function processWebhookDirectly(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  webhookPayload: any
): Promise<{ success: boolean; error?: string }> {
  const eventType = webhookPayload.name || webhookPayload.type;
  const entityType = eventType?.includes('transfer') ? 'transfer' : 'transaction';
  const transactionId = webhookPayload.entity?.id;
  const status = webhookPayload.entity?.status;

  if (!transactionId) {
    return { success: false, error: 'No entity ID in webhook payload' };
  }

  const paymentStatus = statusMap[status] || 'pending';

  console.log(`🔄 Retraitement ${entityType}: ${transactionId}, status: ${status} -> ${paymentStatus}`);

  if (entityType === 'transaction') {
    // Trouver le paiement
    const { data: payment, error: findError } = await supabase
      .from('payments')
      .select('id, status, appointment_id, patient_id, net_amount, payout_status')
      .eq('fedapay_transaction_id', transactionId.toString())
      .maybeSingle();

    if (findError || !payment) {
      return { success: false, error: `Payment not found for transaction ${transactionId}` };
    }

    // Éviter les mises à jour redondantes
    if (payment.status === paymentStatus) {
      console.log(`✅ Paiement ${payment.id} déjà à jour (status: ${paymentStatus})`);
      return { success: true };
    }

    // Calculer le nouveau payout_status
    let newPayoutStatus = payment.payout_status;
    if (paymentStatus === 'paid') {
      // Récupérer la config hold period
      const { data: configData } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'payment_hold_period_days')
        .maybeSingle();

      const holdDays = configData?.value?.days || 2;
      const holdUntil = new Date();
      holdUntil.setDate(holdUntil.getDate() + holdDays);

      newPayoutStatus = 'held';

      // Mettre à jour le paiement
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: paymentStatus,
          payout_status: newPayoutStatus,
          hold_until: holdUntil.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        return { success: false, error: `Failed to update payment: ${updateError.message}` };
      }

      // Mettre à jour le rendez-vous si c'est un paiement classique
      if (!payment.appointment_id.startsWith('group_session_')) {
        await supabase
          .from('appointments')
          .update({ status: 'accepted' })
          .eq('id', payment.appointment_id);
      } else {
        // Mettre à jour le participant de la séance de groupe
        const parts = payment.appointment_id.split('_');
        const participantId = parts[parts.length - 1];
        
        await supabase
          .from('group_session_participants')
          .update({ payment_status: 'paid' })
          .eq('id', participantId);
      }

      // Notifier le patient
      await dispatchNotification({
        supabase,
        supabaseUrl,
        serviceRoleKey: supabaseKey,
        userId: payment.patient_id,
        title: 'Paiement confirmé',
        message: 'Votre paiement a été reçu avec succès.',
        type: 'payment',
        link: '/patient/dashboard',
      });

    } else if (['failed', 'canceled'].includes(paymentStatus)) {
      newPayoutStatus = 'cancelled';
      
      await supabase
        .from('payments')
        .update({
          status: paymentStatus,
          payout_status: newPayoutStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      // Pour les séances de groupe, supprimer le participant si échec
      if (payment.appointment_id.startsWith('group_session_')) {
        const parts = payment.appointment_id.split('_');
        const participantId = parts[parts.length - 1];
        
        await supabase
          .from('group_session_participants')
          .delete()
          .eq('id', participantId);
      }
    }

    console.log(`✅ Paiement ${payment.id} mis à jour: ${payment.status} -> ${paymentStatus}`);
    return { success: true };

  } else if (entityType === 'transfer') {
    // Traitement des transferts (payouts)
    const transferStatus = status === 'approved' ? 'paid' : status === 'declined' ? 'failed' : status;
    
    const { error: payoutError } = await supabase
      .from('practitioner_payouts')
      .update({
        status: transferStatus,
        processed_at: status === 'approved' ? new Date().toISOString() : null
      })
      .eq('id', transactionId);

    if (payoutError) {
      return { success: false, error: `Failed to update payout: ${payoutError.message}` };
    }

    console.log(`✅ Payout ${transactionId} mis à jour: ${transferStatus}`);
    return { success: true };
  }

  return { success: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Récupérer les webhooks échoués à retry
    const { data: failedWebhooks, error: fetchError } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('processing_status', 'failed')
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchError) throw fetchError;

    console.log(`🔄 ${failedWebhooks?.length || 0} webhooks à retry`);

    let retriedCount = 0;
    let permanentlyFailedCount = 0;
    const results: any[] = [];

    for (const webhook of failedWebhooks || []) {
      // Calculer le délai d'attente (exponential backoff: 2, 4, 8, 16, 32 minutes)
      const backoffMinutes = Math.pow(2, webhook.retry_count + 1);
      const lastRetry = webhook.last_retry_at ? new Date(webhook.last_retry_at) : new Date(webhook.created_at);
      const nextRetryTime = new Date(lastRetry.getTime() + backoffMinutes * 60 * 1000);

      // Pas encore le moment de retry
      if (new Date() < nextRetryTime) {
        const waitMinutes = Math.ceil((nextRetryTime.getTime() - Date.now()) / 60000);
        console.log(`⏳ Webhook ${webhook.event_id} - retry dans ${waitMinutes} min`);
        results.push({ event_id: webhook.event_id, status: 'waiting', next_retry_in: `${waitMinutes}m` });
        continue;
      }

      console.log(`🔄 Retry webhook ${webhook.event_id} (tentative ${webhook.retry_count + 1}/${MAX_RETRIES})`);

      try {
        // Traiter directement le webhook (sans rappeler payment-webhook)
        const result = await processWebhookDirectly(supabase, supabaseUrl, supabaseKey, webhook.payload);

        if (result.success) {
          // Marquer comme réussi
          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'success',
              retry_count: webhook.retry_count + 1,
              last_retry_at: new Date().toISOString()
            })
            .eq('id', webhook.id);

          console.log(`✅ Webhook ${webhook.event_id} retraité avec succès`);
          retriedCount++;
          results.push({ event_id: webhook.event_id, status: 'success' });
        } else {
          throw new Error(result.error || 'Unknown processing error');
        }

      } catch (retryError: any) {
        const newRetryCount = webhook.retry_count + 1;

        if (newRetryCount >= MAX_RETRIES) {
          // Marquer comme définitivement échoué
          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'permanently_failed',
              retry_count: newRetryCount,
              error_message: `Max retries atteint: ${retryError.message}`,
              last_retry_at: new Date().toISOString()
            })
            .eq('id', webhook.id);

          console.error(`❌ Webhook ${webhook.event_id} définitivement échoué après ${MAX_RETRIES} tentatives`);
          permanentlyFailedCount++;
          results.push({ event_id: webhook.event_id, status: 'permanently_failed', error: retryError.message });

          // Notifier les admins
          const adminUserIds = await getUsersWithRoles(supabase, ['ops', 'finance']);
          for (const adminId of adminUserIds) {
            await dispatchNotification({
              supabase,
              supabaseUrl,
              serviceRoleKey: supabaseKey,
              userId: adminId,
              title: '⚠️ Webhook échoué définitivement',
              message: `Le webhook ${webhook.event_id} a échoué après ${MAX_RETRIES} tentatives. Intervention manuelle requise.`,
              type: 'webhook_failure',
              link: '/admin?tab=webhooks',
              channels: ['email', 'push'],
            });
          }

        } else {
          // Incrémenter le compteur de retry
          await supabase
            .from('webhook_events')
            .update({
              retry_count: newRetryCount,
              error_message: retryError.message,
              last_retry_at: new Date().toISOString()
            })
            .eq('id', webhook.id);

          const nextRetryMinutes = Math.pow(2, newRetryCount + 1);
          console.log(`⚠️ Webhook ${webhook.event_id} échoué, retry prévu dans ${nextRetryMinutes} min`);
          results.push({ event_id: webhook.event_id, status: 'failed', next_retry_in: `${nextRetryMinutes}m` });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        retried: retriedCount,
        permanently_failed: permanentlyFailedCount,
        total_processed: failedWebhooks?.length || 0,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erreur retry-failed-webhooks:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
