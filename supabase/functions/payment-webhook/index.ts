import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fedapay-signature',
};

/**
 * Vérifie la signature HMAC du webhook FedaPay
 */
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );
    
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return expectedSignature === signature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookSecret = Deno.env.get('FEDAPAY_WEBHOOK_SECRET')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const signature = req.headers.get('x-fedapay-signature');
    const rawBody = await req.text();
    const webhookData = JSON.parse(rawBody);
    
    console.log('Received webhook:', webhookData);

    // Vérification de la signature HMAC
    if (signature && webhookSecret) {
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Vérification de l'horodatage (rejet si > 5 minutes)
    const timestamp = webhookData.created_at;
    if (timestamp) {
      const eventTime = new Date(timestamp * 1000);
      const now = new Date();
      const diffMinutes = (now.getTime() - eventTime.getTime()) / (1000 * 60);
      
      if (diffMinutes > 5) {
        console.error('Webhook timestamp too old:', diffMinutes, 'minutes');
        return new Response(
          JSON.stringify({ error: 'Timestamp too old' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const eventId = webhookData.id;
    
    // Vérification de l'idempotence
    if (eventId) {
      const { data: existingEvent } = await supabase
        .from('webhook_events')
        .select('id')
        .eq('event_id', eventId)
        .single();
      
      if (existingEvent) {
        console.log('Event already processed:', eventId);
        return new Response(
          JSON.stringify({ success: true, message: 'Event already processed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Enregistrer l'événement pour idempotence
      await supabase
        .from('webhook_events')
        .insert({
          event_id: eventId,
          event_type: webhookData.type || 'transaction.update',
          payload: webhookData,
        });
    }

    const transactionId = webhookData.entity?.id;
    const status = webhookData.entity?.status;

    if (!transactionId) {
      console.error('No transaction ID in webhook');
      return new Response(
        JSON.stringify({ error: 'No transaction ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map FedaPay status to normalized status
    const statusMap: Record<string, string> = {
      'pending': 'pending',
      'approved': 'paid',
      'declined': 'failed',
      'canceled': 'canceled',
      'refunded': 'refunded',
    };
    
    const paymentStatus = statusMap[status] || 'pending';

    // Récupérer la config pour calculer la date de hold
    const { data: configData } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['payment_hold_period_days']);
    
    const config: Record<string, any> = {};
    configData?.forEach(row => {
      config[row.key] = row.value;
    });
    
    const holdPeriodDays = config.payment_hold_period_days?.days || 2;
    const holdUntil = new Date();
    holdUntil.setDate(holdUntil.getDate() + holdPeriodDays);

    // Mettre à jour le statut du paiement et la date de hold
    const updateData: any = { 
      status: paymentStatus,
      updated_at: new Date().toISOString(),
    };
    
    // Si le paiement est complété, définir le hold et le statut de payout
    if (paymentStatus === 'paid') {
      updateData.hold_until = holdUntil.toISOString();
      updateData.payout_status = 'held';
    } else if (['failed', 'canceled'].includes(paymentStatus)) {
      updateData.payout_status = 'failed';
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('fedapay_transaction_id', transactionId.toString());

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    console.log(`Payment ${transactionId} updated to status: ${paymentStatus}, hold until: ${holdUntil}`);

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in payment-webhook function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
