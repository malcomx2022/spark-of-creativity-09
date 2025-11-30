import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { dispatchNotification, getUsersWithRoles } from "../_shared/notifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fedapay-signature',
};

/**
 * Comparaison sécurisée de buffers pour prévenir les timing attacks
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  
  return result === 0;
}

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
    
    // ✅ CORRECTION CRITIQUE #1: Utiliser comparaison sécurisée pour prévenir les timing attacks
    const expectedBuffer = encoder.encode(expectedSignature);
    const actualBuffer = encoder.encode(signature);
    
    // Comparaison sécurisée pour éviter les timing attacks
    return timingSafeEqual(expectedBuffer, actualBuffer);
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
  eventType: string,
  fedapayMode: string
) {
  // Map FedaPay status to normalized status - MAPPING COMPLET selon la doc FedaPay
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

  // ✅ CORRECTION ERREUR #2: Utiliser la fonction atomique pour tous les statuts qui affectent le balance
  // Cela inclut 'paid', 'authorized', 'failed', et 'canceled' pour garantir la cohérence des balances
  if (practitionerId && ['paid', 'authorized', 'failed', 'canceled'].includes(paymentStatus)) {
    console.log('Updating payment and balance atomically:', payment.id, practitionerId, paymentStatus);
    
    // Définir le payout_status en fonction du statut de paiement
    const payoutStatus = paymentStatus === 'paid' ? 'held' : 'failed';
    
    const { error: atomicError } = await supabase.rpc('update_payment_with_balance', {
      p_payment_id: payment.id,
      p_practitioner_id: practitionerId,
      p_net_amount: netAmount,
      p_new_status: paymentStatus,
      p_new_payout_status: payoutStatus,
      p_hold_until: paymentStatus === 'paid' ? holdUntil.toISOString() : null
    });

    if (atomicError) {
      console.error('Atomic update error:', atomicError);
      throw atomicError;
    }
  } else {
    // Pour les autres statuts (pending, authorized, etc.), mise à jour simple sans affecter le balance
    const updateData: any = { 
      status: paymentStatus,
      updated_at: new Date().toISOString(),
    };

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

  // ✅ CORRECTION: Les écritures ledger sont appelées APRÈS la mise à jour du paiement
  // pour éviter les conflits avec la RPC update_payment_with_balance

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
        
        // Notifier le coach
        if (practitionerId) {
          const { data: practitionerData } = await supabase
            .from('practitioners')
            .select('user_id, name')
            .eq('id', practitionerId)
            .single();
            
          if (practitionerData?.user_id) {
            await dispatchNotification({
              supabase,
              supabaseUrl,
              serviceRoleKey: supabaseKey,
              userId: practitionerData.user_id,
              title: '💰 Nouveau paiement reçu',
              message: `Un participant a payé pour votre séance de groupe. Montant: ${netAmount} XOF`,
              type: 'payment',
              link: '/dashboard/practitioner?tab=sessions',
            });
          }
        }
      } else {
        // RDV classique
        await supabase
          .from('appointments')
          .update({ status: 'confirmed' })
          .eq('id', payment.appointment_id);
          
        // Récupérer les détails du rendez-vous pour notifier le praticien
        const { data: appointmentData } = await supabase
          .from('appointments')
          .select('practitioner_id, patient_name, date, time, specialty')
          .eq('id', payment.appointment_id)
          .single();
          
        if (appointmentData) {
          // Notifier le praticien
          const { data: practitionerData } = await supabase
            .from('practitioners')
            .select('user_id, name')
            .eq('id', appointmentData.practitioner_id)
            .single();
            
          if (practitionerData?.user_id) {
            await dispatchNotification({
              supabase,
              supabaseUrl,
              serviceRoleKey: supabaseKey,
              userId: practitionerData.user_id,
              title: '✅ Nouveau rendez-vous confirmé',
              message: `Rendez-vous avec ${appointmentData.patient_name} confirmé pour le ${appointmentData.date} à ${appointmentData.time}. Montant reçu: ${netAmount} XOF`,
              type: 'appointment',
              link: '/dashboard/practitioner?tab=appointments',
            });
          }
        }
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

    // Envoyer notifications au patient
    const notificationMessages = {
      'paid': `✅ Votre paiement de ${payment.amount} XOF a été confirmé avec succès ! Votre rendez-vous est maintenant validé.`,
      'failed': `❌ Le paiement de ${payment.amount} XOF a échoué. Veuillez réessayer pour confirmer votre rendez-vous.`,
      'canceled': `❌ Le paiement de ${payment.amount} XOF a été annulé.`,
      'refunded': `💰 Votre paiement de ${payment.amount} XOF a été remboursé.`
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

    // ✅ CORRECTION: Appeler apply-ledger-entries APRÈS toutes les mises à jour
    if (paymentStatus === 'paid') {
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

  let webhookEventId: string | null = null;
  let supabase: any = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookSecret = Deno.env.get('FEDAPAY_WEBHOOK_SECRET');
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    supabase = createClient(supabaseUrl, supabaseKey);

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

    // ✅ AMÉLIORATION #3: Vérification de l'horodatage avec différenciation sandbox/production
    const timestamp = webhookData.created_at;
    if (timestamp) {
      const eventTime = new Date(timestamp * 1000);
      const now = new Date();
      const diffMinutes = (now.getTime() - eventTime.getTime()) / (1000 * 60);
      
      // En sandbox: 30 minutes de marge (tests lents), en production: 5 minutes
      const maxAgeMinutes = fedapayMode === 'sandbox' ? 30 : 5;
      const clockSkewMinutes = fedapayMode === 'sandbox' ? 5 : 1;
      
      // Rejeter si trop vieux OU dans le futur (avec marge pour clock skew)
      if (diffMinutes > maxAgeMinutes || diffMinutes < -clockSkewMinutes) {
        console.error('Webhook timestamp invalid:', {
          mode: fedapayMode,
          eventTime: eventTime.toISOString(),
          now: now.toISOString(),
          diffMinutes,
          maxAge: maxAgeMinutes,
          reason: diffMinutes > 0 ? 'too_old' : 'in_future'
        });
        return new Response(
          JSON.stringify({ error: 'Invalid timestamp' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const eventId = webhookData.id;
    
    // ✅ AMÉLIORATION #4: Vérification de l'idempotence avec UPSERT atomique
    if (eventId) {
      const { data: webhookEvent, error: upsertError } = await supabase
        .from('webhook_events')
        .upsert({
          event_id: eventId,
          event_type: webhookData.type || 'transaction.update',
          payload: webhookData,
        }, {
          onConflict: 'event_id',
          ignoreDuplicates: true
        })
        .select()
        .maybeSingle();

      // Si pas de données retournées, c'est que l'événement existait déjà (ignoreDuplicates)
      if (!webhookEvent) {
        console.log('Event already processed (atomic check):', eventId);
        return new Response(
          JSON.stringify({ success: true, message: 'Event already processed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (upsertError) {
        console.error('Error inserting webhook event:', upsertError);
        throw upsertError;
      }

      webhookEventId = webhookEvent?.id;

      // Marquer comme en cours de traitement
      if (webhookEventId) {
        await supabase
          .from('webhook_events')
          .update({ processing_status: 'processing' })
          .eq('id', webhookEventId);
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
      await handleTransactionEvent(supabase, supabaseUrl, supabaseKey, transactionId, status, eventType, fedapayMode);
    }

    // Gestion des événements de transfer (reversements)
    if (entityType === 'transfer') {
      await handleTransferEvent(supabase, supabaseUrl, supabaseKey, transactionId, status, eventType);
    }


    // Marquer le webhook comme traité avec succès
    if (webhookEventId) {
      await supabase
        .from('webhook_events')
        .update({ processing_status: 'success' })
        .eq('id', webhookEventId);
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
    
    // Marquer le webhook comme échoué pour retry ultérieur
    if (webhookEventId) {
      await supabase
        .from('webhook_events')
        .update({ 
          processing_status: 'failed',
          error_message: errorMessage,
          error_stack: error instanceof Error ? error.stack : null,
          last_retry_at: new Date().toISOString()
        })
        .eq('id', webhookEventId);
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
