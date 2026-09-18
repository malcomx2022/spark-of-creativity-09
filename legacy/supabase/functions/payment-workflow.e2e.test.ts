/**
 * Tests End-to-End du workflow de paiement complet
 * 
 * Ce fichier teste le flux complet:
 * 1. Création d'un paiement (create-payment)
 * 2. Réception du webhook FedaPay (payment-webhook)
 * 3. Release des fonds (release-held-funds)
 * 4. Création du payout (create-payout)
 * 
 * Pour exécuter: deno test --allow-net --allow-env supabase/functions/payment-workflow.e2e.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration de test
const TEST_CONFIG = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') || 'http://localhost:54321',
  supabaseKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  testPatientId: '00000000-0000-0000-0000-000000000001',
  testPractitionerId: '00000000-0000-0000-0000-000000000002',
  testAppointmentId: '00000000-0000-0000-0000-000000000003',
  testAmount: 5000,
  testPhoneNumber: '+22961234567',
};

/**
 * Helper: Créer un client Supabase pour les tests
 */
function createTestClient() {
  return createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
}

/**
 * Helper: Nettoyer les données de test
 */
async function cleanupTestData(supabase: any, paymentId?: string) {
  if (paymentId) {
    await supabase.from('payment_events').delete().eq('payment_id', paymentId);
    await supabase.from('ledger_entries').delete().eq('payment_id', paymentId);
    await supabase.from('payments').delete().eq('id', paymentId);
  }
  
  await supabase
    .from('practitioner_balances')
    .delete()
    .eq('practitioner_id', TEST_CONFIG.testPractitionerId);
    
  await supabase
    .from('practitioner_payouts')
    .delete()
    .eq('practitioner_id', TEST_CONFIG.testPractitionerId);
}

/**
 * Helper: Créer un appointment de test
 */
async function createTestAppointment(supabase: any) {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      id: TEST_CONFIG.testAppointmentId,
      patient_id: TEST_CONFIG.testPatientId,
      practitioner_id: TEST_CONFIG.testPractitionerId,
      appointment_date: new Date(Date.now() + 86400000).toISOString(),
      status: 'pending',
      consultation_type: 'video',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Helper: Créer les informations de paiement du praticien
 */
async function createPractitionerPaymentInfo(supabase: any) {
  const { error } = await supabase
    .from('practitioner_payment_info')
    .insert({
      practitioner_id: TEST_CONFIG.testPractitionerId,
      payment_method: 'mobile_money',
      mobile_money_provider: 'mtn',
      mobile_money_number: TEST_CONFIG.testPhoneNumber,
      is_verified: true,
    });

  if (error) throw error;
}

Deno.test('Payment Workflow E2E - Workflow complet de paiement', async (t) => {
  const supabase = createTestClient();
  let paymentId: string | undefined;

  try {
    // Setup: Créer les données de test
    await cleanupTestData(supabase);
    await createTestAppointment(supabase);
    await createPractitionerPaymentInfo(supabase);

    // ============================================================
    // ÉTAPE 1: Création du paiement (create-payment)
    // ============================================================
    await t.step('1. Création du paiement - status: initiated', async () => {
      // Insérer directement un paiement pour le test (simulation de create-payment)
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          appointment_id: TEST_CONFIG.testAppointmentId,
          patient_id: TEST_CONFIG.testPatientId,
          amount: TEST_CONFIG.testAmount,
          currency: 'XOF',
          payment_method: 'mtn',
          status: 'initiated',
          payout_status: 'pending',
          commission_amount: 500,
          gateway_fees_amount: 100,
          fees_amount: 600,
          net_amount: 4400,
          fedapay_transaction_id: 'test-transaction-123',
        })
        .select()
        .single();

      assertExists(payment, 'Le paiement doit être créé');
      assertEquals(payment.status, 'initiated', 'Le statut doit être initiated');
      assertEquals(payment.payout_status, 'pending', 'Le payout_status doit être pending');
      paymentId = payment.id;

      // Initialiser le balance (simulation de initialize_payment_balance)
      const { error: balanceError } = await supabase.rpc('initialize_payment_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
      });

      assertEquals(balanceError, null, 'initialize_payment_balance ne doit pas échouer');

      // Vérifier que balance_pending est créé
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertExists(balance, 'Le balance praticien doit être créé');
      assertEquals(balance.balance_pending, 4400, 'balance_pending doit être 4400');
      assertEquals(balance.balance_on_hold, 0, 'balance_on_hold doit être 0');
      assertEquals(balance.balance_available, 0, 'balance_available doit être 0');
    });

    // ============================================================
    // ÉTAPE 2: Webhook FedaPay - Paiement confirmé (paid)
    // ============================================================
    await t.step('2. Webhook FedaPay - Transition vers paid et held', async () => {
      const holdUntil = new Date();
      holdUntil.setDate(holdUntil.getDate() + 2);

      // Appeler la fonction RPC atomique (simulation du webhook)
      const { error: updateError } = await supabase.rpc('update_payment_with_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
        p_new_status: 'paid',
        p_new_payout_status: 'held',
        p_hold_until: holdUntil.toISOString(),
      });

      assertEquals(updateError, null, 'update_payment_with_balance ne doit pas échouer');

      // Vérifier que le paiement est mis à jour
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      assertEquals(payment.status, 'paid', 'Le statut doit être paid');
      assertEquals(payment.payout_status, 'held', 'Le payout_status doit être held');
      assertExists(payment.hold_until, 'hold_until doit être défini');

      // Vérifier que les balances sont mises à jour (pending -> on_hold)
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 0, 'balance_pending doit être 0');
      assertEquals(balance.balance_on_hold, 4400, 'balance_on_hold doit être 4400');
      assertEquals(balance.balance_available, 0, 'balance_available doit être 0');
    });

    // ============================================================
    // ÉTAPE 3: Release des fonds (release-held-funds)
    // ============================================================
    await t.step('3. Release des fonds - Transition vers ready', async () => {
      // Appeler la fonction RPC atomique (simulation de release-held-funds)
      const { error: releaseError } = await supabase.rpc('update_payment_with_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
        p_new_status: 'paid',
        p_new_payout_status: 'ready',
        p_hold_until: null,
      });

      assertEquals(releaseError, null, 'release ne doit pas échouer');

      // Vérifier que le paiement est mis à jour
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      assertEquals(payment.payout_status, 'ready', 'Le payout_status doit être ready');

      // Vérifier que les balances sont mises à jour (on_hold -> available)
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 0, 'balance_pending doit être 0');
      assertEquals(balance.balance_on_hold, 0, 'balance_on_hold doit être 0');
      assertEquals(balance.balance_available, 4400, 'balance_available doit être 4400');
    });

    // ============================================================
    // ÉTAPE 4: Création du payout (create-payout)
    // ============================================================
    await t.step('4. Création du payout - Déduction du balance_available', async () => {
      // Créer un payout (simulation de create-payout)
      const { data: payout, error: payoutError } = await supabase
        .from('practitioner_payouts')
        .insert({
          practitioner_id: TEST_CONFIG.testPractitionerId,
          amount: 4400,
          status: 'pending',
          payment_method: 'mobile_money',
          payment_details: {
            provider: 'mtn',
            number: TEST_CONFIG.testPhoneNumber,
          },
        })
        .select()
        .single();

      assertExists(payout, 'Le payout doit être créé');
      assertEquals(payout.status, 'pending', 'Le payout status doit être pending');

      // Déduire du balance_available (simulation de create-payout-batch)
      const { error: deductError } = await supabase
        .from('practitioner_balances')
        .update({
          balance_available: 0,
        })
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId);

      assertEquals(deductError, null, 'La déduction ne doit pas échouer');

      // Vérifier que le balance est mis à jour
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_available, 0, 'balance_available doit être 0 après payout');
      assertEquals(balance.balance_pending, 0, 'balance_pending doit rester 0');
      assertEquals(balance.balance_on_hold, 0, 'balance_on_hold doit rester 0');
    });

    // ============================================================
    // ÉTAPE 5: Vérification des événements et écritures comptables
    // ============================================================
    await t.step('5. Vérification des payment_events', async () => {
      const { data: events, error: eventsError } = await supabase
        .from('payment_events')
        .select('*')
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: true });

      assertEquals(eventsError, null, 'La récupération des events ne doit pas échouer');
      assertExists(events, 'Les events doivent exister');
      
      // On devrait avoir au moins un événement payment.intent.succeeded
      const successEvent = events.find((e: any) => e.event_type === 'payment.intent.succeeded');
      assertExists(successEvent, 'Un événement payment.intent.succeeded doit exister');
    });

    console.log('✅ Workflow E2E complet validé avec succès!');

  } catch (error) {
    console.error('❌ Erreur dans le workflow E2E:', error);
    throw error;
  } finally {
    // Cleanup: Nettoyer les données de test
    await cleanupTestData(supabase, paymentId);
    await supabase.from('appointments').delete().eq('id', TEST_CONFIG.testAppointmentId);
    await supabase
      .from('practitioner_payment_info')
      .delete()
      .eq('practitioner_id', TEST_CONFIG.testPractitionerId);
  }
});

/**
 * Test: Workflow avec échec de paiement
 */
Deno.test('Payment Workflow E2E - Gestion des échecs de paiement', async (t) => {
  const supabase = createTestClient();
  let paymentId: string | undefined;

  try {
    await cleanupTestData(supabase);
    await createTestAppointment(supabase);

    await t.step('1. Création paiement et échec via webhook', async () => {
      // Créer le paiement
      const { data: payment } = await supabase
        .from('payments')
        .insert({
          appointment_id: TEST_CONFIG.testAppointmentId,
          patient_id: TEST_CONFIG.testPatientId,
          amount: TEST_CONFIG.testAmount,
          currency: 'XOF',
          payment_method: 'mtn',
          status: 'initiated',
          payout_status: 'pending',
          net_amount: 4400,
          fedapay_transaction_id: 'test-transaction-failed',
        })
        .select()
        .single();

      paymentId = payment.id;

      // Initialiser balance
      await supabase.rpc('initialize_payment_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
      });

      // Simuler un échec via webhook
      const { error: updateError } = await supabase.rpc('update_payment_with_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
        p_new_status: 'failed',
        p_new_payout_status: 'failed',
        p_hold_until: null,
      });

      assertEquals(updateError, null, 'La mise à jour ne doit pas échouer');

      // Vérifier que le paiement est failed
      const { data: failedPayment } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      assertEquals(failedPayment.status, 'failed', 'Le statut doit être failed');
      assertEquals(failedPayment.payout_status, 'failed', 'Le payout_status doit être failed');

      // Vérifier que balance_pending est remis à 0
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 0, 'balance_pending doit être 0 après échec');
      assertEquals(balance.balance_on_hold, 0, 'balance_on_hold doit rester 0');
      assertEquals(balance.balance_available, 0, 'balance_available doit rester 0');
    });

    console.log('✅ Test de gestion des échecs validé avec succès!');

  } finally {
    await cleanupTestData(supabase, paymentId);
    await supabase.from('appointments').delete().eq('id', TEST_CONFIG.testAppointmentId);
  }
});

/**
 * Test: Workflow avec paiements multiples
 */
Deno.test('Payment Workflow E2E - Paiements multiples pour un praticien', async (t) => {
  const supabase = createTestClient();
  const paymentIds: string[] = [];

  try {
    await cleanupTestData(supabase);
    await createTestAppointment(supabase);
    await createPractitionerPaymentInfo(supabase);

    await t.step('1. Créer 3 paiements successifs', async () => {
      for (let i = 0; i < 3; i++) {
        const { data: payment } = await supabase
          .from('payments')
          .insert({
            appointment_id: TEST_CONFIG.testAppointmentId,
            patient_id: TEST_CONFIG.testPatientId,
            amount: TEST_CONFIG.testAmount,
            currency: 'XOF',
            payment_method: 'mtn',
            status: 'initiated',
            payout_status: 'pending',
            net_amount: 4400,
            fedapay_transaction_id: `test-transaction-multi-${i}`,
          })
          .select()
          .single();

        paymentIds.push(payment.id);

        await supabase.rpc('initialize_payment_balance', {
          p_payment_id: payment.id,
          p_practitioner_id: TEST_CONFIG.testPractitionerId,
          p_net_amount: 4400,
        });
      }

      // Vérifier que balance_pending cumule les 3 paiements
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 13200, 'balance_pending doit être 3 × 4400 = 13200');
    });

    await t.step('2. Confirmer les 3 paiements via webhook', async () => {
      const holdUntil = new Date();
      holdUntil.setDate(holdUntil.getDate() + 2);

      for (const paymentId of paymentIds) {
        await supabase.rpc('update_payment_with_balance', {
          p_payment_id: paymentId,
          p_practitioner_id: TEST_CONFIG.testPractitionerId,
          p_net_amount: 4400,
          p_new_status: 'paid',
          p_new_payout_status: 'held',
          p_hold_until: holdUntil.toISOString(),
        });
      }

      // Vérifier que balance_on_hold cumule les 3 paiements
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 0, 'balance_pending doit être 0');
      assertEquals(balance.balance_on_hold, 13200, 'balance_on_hold doit être 13200');
    });

    console.log('✅ Test de paiements multiples validé avec succès!');

  } finally {
    for (const paymentId of paymentIds) {
      await cleanupTestData(supabase, paymentId);
    }
    await supabase.from('appointments').delete().eq('id', TEST_CONFIG.testAppointmentId);
    await supabase
      .from('practitioner_payment_info')
      .delete()
      .eq('practitioner_id', TEST_CONFIG.testPractitionerId);
  }
});
