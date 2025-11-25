import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { dispatchNotification, getUsersWithRoles } from "../_shared/notifications.ts";

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

/**
 * Gère les événements de transaction (paiements)
 */
async function handleTransactionEvent(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  transactionId: string,
  status: string,
  eventType: string
) {
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
  configData?.forEach((row: { key: string; value: any }) => {
    config[row.key] = row.value;
  });
  
  const holdPeriodDays = config.payment_hold_period_days?.days || 2;
  const holdUntil = new Date();
  holdUntil.setDate(holdUntil.getDate() + holdPeriodDays);

  // Récupérer le paiement pour les mises à jour
  const { data: payment } = await supabase
    .from('payments')
    .select('id, net_amount, appointment_id')
    .eq('fedapay_transaction_id', transactionId.toString())
    .single();

  if (!payment) {
    throw new Error('Payment not found');
  }

  // Déterminer le practitioner_id selon le type (rendez-vous classique vs séance de groupe)
  let practitionerId: string | null = null;
  const netAmount = payment.net_amount || 0;

  if (payment.appointment_id && payment.appointment_id.startsWith('group_session_')) {
    // Format: group_session_{sessionId}_{participantId}
    console.log('🏋️ Paiement de séance de groupe détecté dans webhook');
    const parts = payment.appointment_id.split('_');
    const sessionId = parts[2];
    
    // Récupérer le coach_id depuis group_sessions
    const { data: sessionData } = await supabase
      .from('group_sessions')
      .select('coach_id')
      .eq('id', sessionId)
      .single();
    
    if (sessionData?.coach_id) {
      practitionerId = sessionData.coach_id;
      console.log('Coach ID récupéré pour webhook:', practitionerId);
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

  // ✅ CORRECTION ERREUR #2: Utiliser la fonction atomique pour mettre à jour payment + balance
  if (practitionerId && paymentStatus === 'paid') {
    console.log('Updating payment and balance atomically:', payment.id, practitionerId);
    
    const { error: atomicError } = await supabase.rpc('update_payment_with_balance', {
      p_payment_id: payment.id,
      p_practitioner_id: practitionerId,
      p_net_amount: netAmount,
      p_new_status: paymentStatus,
      p_new_payout_status: 'held',
      p_hold_until: holdUntil.toISOString()
    });

    if (atomicError) {
      console.error('Atomic update error:', atomicError);
      throw atomicError;
    }
  } else {
    // Pour les statuts non-paid, mise à jour simple
    const updateData: any = { 
      status: paymentStatus,
      updated_at: new Date().toISOString(),
    };
    
    if (['failed', 'canceled'].includes(paymentStatus)) {
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
  }

  console.log(`Payment ${transactionId} updated to status: ${paymentStatus}`);

  // ✅ CORRECTION ERREUR #3: Appeler apply-ledger-entries pour les écritures comptables
  if (paymentStatus === 'paid' && payment) {
    console.log('Applying ledger entries for payment:', payment.id);
    
    const { error: ledgerError } = await supabase.functions.invoke('apply-ledger-entries', {
      body: {
        paymentId: payment.id,
        status: 'paid'
      }
    });

    if (ledgerError) {
      console.error('Warning: Failed to apply ledger entries:', ledgerError);
      // Non-bloquant, on continue
    }
  }

  if (payment) {
    // Émettre événement selon le statut
    const paymentEventType = paymentStatus === 'paid' 
      ? 'payment.intent.succeeded' 
      : paymentStatus === 'failed' 
      ? 'payment.intent.failed'
      : 'payment.intent.updated';

    await supabase
      .from('payment_events')
      .insert({
        payment_id: payment.id,
        event_type: paymentEventType,
        event_data: {
          status: paymentStatus,
          fedapay_status: status,
          transaction_id: transactionId
        }
      });

    // Mettre à jour le statut de l'appointment ou de la participation groupe
    if (paymentStatus === 'paid') {
      // Vérifier si c'est une séance de groupe
      if (payment.appointment_id && payment.appointment_id.startsWith('group_session_')) {
        // Format: group_session_{sessionId}_{participantId}
        const parts = payment.appointment_id.split('_');
        const participantId = parts[parts.length - 1];
        
        await supabase
          .from('group_session_participants')
          .update({ payment_status: 'paid' })
          .eq('id', participantId);
          
        console.log(`Group session participant ${participantId} payment confirmed`);
      } else {
        // RDV classique
        await supabase
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', payment.appointment_id);
      }
    } else if (['failed', 'canceled'].includes(paymentStatus)) {
      if (payment.appointment_id && payment.appointment_id.startsWith('group_session_')) {
        const parts = payment.appointment_id.split('_');
        const participantId = parts[parts.length - 1];
        
        // Supprimer la participation si le paiement échoue
        await supabase
          .from('group_session_participants')
          .delete()
          .eq('id', participantId);
          
        console.log(`Group session participant ${participantId} deleted due to payment failure`);
      } else {
        await supabase
          .from('appointments')
          .update({ status: 'canceled' })
          .eq('id', payment.appointment_id);
      }
    }

    // Envoyer notifications
    const notificationMessages = {
      'paid': `Votre paiement de ${payment.amount} XOF a été confirmé avec succès !`,
      'failed': `Le paiement de ${payment.amount} XOF a échoué. Veuillez réessayer.`,
      'canceled': `Le paiement de ${payment.amount} XOF a été annulé.`,
      'refunded': `Votre paiement de ${payment.amount} XOF a été remboursé.`
    };

    if (notificationMessages[paymentStatus as keyof typeof notificationMessages]) {
      await dispatchNotification({
        supabase,
        supabaseUrl,
        serviceRoleKey: supabaseKey,
        userId: payment.patient_id,
        title: `Paiement ${paymentStatus === 'paid' ? 'confirmé' : 'mis à jour'}`,
        message: notificationMessages[paymentStatus as keyof typeof notificationMessages],
        type: 'payment',
        link: '/dashboard/patient',
      });
    }

    const importantStatuses = new Set(['approved', 'declined', 'refunded']);
    if (importantStatuses.has(status)) {
      const adminUserIds = await getUsersWithRoles(supabase, ['ops', 'finance']);
      if (adminUserIds.length > 0) {
        const adminTitle = status === 'approved'
          ? 'Webhook paiement confirmé'
          : `Webhook paiement ${status}`;
        const adminMessage = `Webhook ${eventType} reçu pour la transaction ${transactionId} (${status}). Montant: ${payment.amount} XOF.`;
        for (const adminId of adminUserIds) {
          await dispatchNotification({
            supabase,
            supabaseUrl,
            serviceRoleKey: supabaseKey,
            userId: adminId,
            title: adminTitle,
            message: adminMessage,
            type: 'payment_webhook',
            link: '/admin?tab=finance',
            channels: ['email', 'sms', 'push'],
          });
        }
      }
    }

    // Audit log
    await supabase
      .from('admin_audit_logs')
      .insert({
        admin_id: payment.patient_id,
        action: `payment.${paymentStatus}`,
        entity_type: 'payment',
        entity_id: payment.id,
        details: {
          transaction_id: transactionId,
          amount: payment.amount,
          status: paymentStatus,
          event_type: eventType
        }
      });

    // Apply ledger entries for paid payment
    if (paymentStatus === 'paid') {
      try {
        await fetch(`${supabaseUrl}/functions/v1/apply-ledger-entries`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentId: payment.id,
            status: 'paid'
          })
        });
      } catch (ledgerError) {
        console.error('Error applying ledger entries:', ledgerError);
      }
    }
  }
}

/**
 * Gère les événements de transfer (reversements)
 */
async function handleTransferEvent(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  transferId: string,
  status: string,
  eventType: string
) {
  console.log(`Processing transfer event: ${eventType}, status: ${status}`);

  const transferStatus = status === 'approved' ? 'paid' : status === 'declined' ? 'failed' : status;

  // Mettre à jour le payout
  const { data: payout, error: payoutError } = await supabase
    .from('practitioner_payouts')
    .update({ 
      status: transferStatus,
      processed_at: status === 'approved' ? new Date().toISOString() : null
    })
    .eq('id', transferId)
    .select('practitioner_id, amount')
    .single();

  if (payoutError) {
    console.error('Error updating payout:', payoutError);
    return;
  }

  if (payout) {
    // Envoyer notification au praticien
    const notificationMessages = {
      'approved': `Votre reversement de ${payout.amount} XOF a été effectué avec succès !`,
      'declined': `Le reversement de ${payout.amount} XOF a échoué. Contactez le support.`
    };

    if (notificationMessages[status as keyof typeof notificationMessages]) {
      await dispatchNotification({
        supabase,
        supabaseUrl,
        serviceRoleKey: supabaseKey,
        userId: payout.practitioner_id,
        title: `Reversement ${status === 'approved' ? 'effectué' : 'échoué'}`,
        message: notificationMessages[status as keyof typeof notificationMessages],
        type: 'payout',
        link: '/dashboard/practitioner',
      });
    }

    if (['approved', 'declined'].includes(status)) {
      const adminUserIds = await getUsersWithRoles(supabase, ['ops', 'finance']);
      if (adminUserIds.length > 0) {
        const adminTitle = status === 'approved' ? 'Reversement effectué' : 'Reversement échoué';
        const adminMessage = `Webhook ${eventType} reçu pour le reversement ${transferId} (${status}). Montant: ${payout.amount} XOF.`;
        for (const adminId of adminUserIds) {
          await dispatchNotification({
            supabase,
            supabaseUrl,
            serviceRoleKey: supabaseKey,
            userId: adminId,
            title: adminTitle,
            message: adminMessage,
            type: 'payout_webhook',
            link: '/admin?tab=finance',
            channels: ['email', 'sms', 'push'],
          });
        }
      }
    }

    // Audit log
    await supabase
      .from('admin_audit_logs')
      .insert({
        admin_id: payout.practitioner_id,
        action: `transfer.${transferStatus}`,
        entity_type: 'payout',
        entity_id: transferId,
        details: {
          amount: payout.amount,
          status: transferStatus,
          event_type: eventType
        }
      });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookSecret = Deno.env.get('FEDAPAY_WEBHOOK_SECRET');
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const signature = req.headers.get('x-fedapay-signature');
    const rawBody = await req.text();
    const webhookData = JSON.parse(rawBody);
    
    console.log('Received webhook:', {
      event: webhookData.name,
      hasSignature: !!signature,
      mode: fedapayMode
    });

    // ⚠️ En mode sandbox, FedaPay n'envoie pas toujours de signature valide
    // On va donc être plus permissif en sandbox mais strict en production
    if (signature && webhookSecret && fedapayMode === 'live') {
      console.log('Verifying webhook signature (live mode)...');
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid webhook signature in live mode');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('✅ Signature verified');
    } else if (fedapayMode === 'sandbox') {
      console.log('⚠️ Sandbox mode: skipping signature verification');
    } else if (!webhookSecret) {
      console.warn('⚠️ No webhook secret configured, skipping verification');
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
      
    // ✅ CORRECTION BUG #3: Enregistrer l'événement avec gestion de conflit
    const { error: insertError } = await supabase
      .from('webhook_events')
      .insert({
        event_id: eventId,
        event_type: webhookData.type || 'transaction.update',
        payload: webhookData,
      });
    
    // Si erreur de contrainte unique (23505), l'événement existe déjà
    if (insertError?.code === '23505') {
      console.log('Event already processed (duplicate):', eventId);
      return new Response(
        JSON.stringify({ success: true, message: 'Event already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (insertError) {
      // Autre erreur, la propager
      throw insertError;
    }
  }

    const eventType = webhookData.type;
    const entityType = eventType?.includes('transfer') ? 'transfer' : 'transaction';
    const transactionId = webhookData.entity?.id;
    const status = webhookData.entity?.status;

    if (!transactionId) {
      console.error('No transaction/transfer ID in webhook');
      return new Response(
        JSON.stringify({ error: 'No entity ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${entityType} event: ${eventType}, status: ${status}`);

    // Gestion des événements de transaction (paiements)
    if (entityType === 'transaction') {
      await handleTransactionEvent(supabase, supabaseUrl, supabaseKey, transactionId, status, eventType);
    }

    // Gestion des événements de transfer (reversements)
    if (entityType === 'transfer') {
      await handleTransferEvent(supabase, supabaseUrl, supabaseKey, transactionId, status, eventType);
    }


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
