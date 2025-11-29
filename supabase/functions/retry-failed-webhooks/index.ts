import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_RETRIES = 5;

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

    for (const webhook of failedWebhooks || []) {
      // Calculer le délai d'attente (exponential backoff)
      const backoffMinutes = Math.pow(2, webhook.retry_count); // 1, 2, 4, 8, 16 minutes
      const lastRetry = webhook.last_retry_at ? new Date(webhook.last_retry_at) : new Date(webhook.created_at);
      const nextRetryTime = new Date(lastRetry.getTime() + backoffMinutes * 60 * 1000);

      // Pas encore le moment de retry
      if (new Date() < nextRetryTime) {
        console.log(`⏳ Webhook ${webhook.event_id} - retry dans ${Math.ceil((nextRetryTime.getTime() - Date.now()) / 60000)} min`);
        continue;
      }

      console.log(`🔄 Retry webhook ${webhook.event_id} (tentative ${webhook.retry_count + 1}/${MAX_RETRIES})`);

      try {
        // Rejouer le webhook
        const { error: retryError } = await supabase.functions.invoke('payment-webhook', {
          body: webhook.payload,
          headers: {
            'x-fedapay-signature': 'retry',
          }
        });

        if (retryError) {
          throw retryError;
        }

        console.log(`✅ Webhook ${webhook.event_id} retraité avec succès`);
        retriedCount++;

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

          console.log(`⚠️ Webhook ${webhook.event_id} échoué, retry prévu dans ${Math.pow(2, newRetryCount)} min`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        retried: retriedCount,
        permanently_failed: permanentlyFailedCount,
        total_processed: failedWebhooks?.length || 0
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
