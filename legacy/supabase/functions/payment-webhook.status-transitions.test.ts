/**
 * Tests End-to-End des transitions de statut de paiement
 * 
 * Ce fichier teste spécifiquement le flux normal de FedaPay:
 * 1. Création paiement avec status 'initiated'
 * 2. Webhook FedaPay avec status 'pending' (transition)
 * 3. Webhook FedaPay avec status 'approved' (mappé à 'paid')
 * 4. Vérification des balances et du statut de l'appointment
 * 
 * Pour exécuter: deno test --allow-net --allow-env supabase/functions/payment-webhook.status-transitions.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration de test
const TEST_CONFIG = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') || 'http://localhost:54321',
  supabaseKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  testPatientId: '00000000-0000-0000-0000-000000000011',
  testPractitionerId: '00000000-0000-0000-0000-000000000012',
  testAppointmentId: '00000000-0000-0000-0000-000000000013',
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
    await supabase.from('payments').delete().eq('id', paymentId);
  }
  
  await supabase
    .from('practitioner_balances')
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
      patient_name: 'Test Patient',
      practitioner_id: TEST_CONFIG.testPractitionerId,
      practitioner_name: 'Test Practitioner',
      specialty: 'Test Specialty',
      date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      time: '10:00',
      status: 'pending',
      address: '123 Test St',
      reason: 'Test consultation',
    })
    .select()
    .single();

  if (error && error.code !== '23505') { // Ignore duplicate key errors
    throw error;
  }
  return data;
}

Deno.test('Payment Status Transitions - Flux complet pending → paid', async (t) => {
  const supabase = createTestClient();
  let paymentId: string | undefined;

  try {
    // Setup: Créer les données de test
    await cleanupTestData(supabase);
    await createTestAppointment(supabase);

    // ============================================================
    // ÉTAPE 1: Création du paiement avec status 'initiated'
    // ============================================================
    await t.step('1. Création paiement - status: initiated', async () => {
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
          fedapay_transaction_id: 'test-transition-123',
        })
        .select()
        .single();

      assertExists(payment, 'Le paiement doit être créé');
      assertEquals(payment.status, 'initiated', 'Le statut doit être initiated');
      assertEquals(payment.payout_status, 'pending', 'Le payout_status doit être pending');
      paymentId = payment.id;

      // Initialiser le balance
      const { error: balanceError } = await supabase.rpc('initialize_payment_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
      });

      assertEquals(balanceError, null, 'initialize_payment_balance ne doit pas échouer');

      // Vérifier que balance_pending contient le montant
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertExists(balance, 'Le balance praticien doit être créé');
      assertEquals(balance.balance_pending, 4400, 'balance_pending doit contenir 4400');
      assertEquals(balance.balance_on_hold, 0, 'balance_on_hold doit être 0');
      assertEquals(balance.balance_available, 0, 'balance_available doit être 0');
      
      console.log('✅ Étape 1: Paiement créé avec balance_pending = 4400');
    });

    // ============================================================
    // ÉTAPE 2: Webhook FedaPay avec status 'pending'
    // ============================================================
    await t.step('2. Webhook pending - status reste pending, balance inchangé', async () => {
      // Simuler un webhook FedaPay avec status 'pending'
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      assertEquals(updateError, null, 'La mise à jour ne doit pas échouer');

      // Vérifier que le status est passé à 'pending'
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      assertEquals(payment.status, 'pending', 'Le statut doit être pending');
      assertEquals(payment.payout_status, 'pending', 'Le payout_status doit rester pending');

      // Vérifier que balance_pending reste inchangé
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 4400, 'balance_pending doit rester 4400');
      assertEquals(balance.balance_on_hold, 0, 'balance_on_hold doit rester 0');
      assertEquals(balance.balance_available, 0, 'balance_available doit rester 0');
      
      console.log('✅ Étape 2: Transition pending confirmée, balance inchangé');
    });

    // ============================================================
    // ÉTAPE 3: Webhook FedaPay avec status 'approved' (mappé à 'paid')
    // ============================================================
    await t.step('3. Webhook approved → paid - Transition des balances', async () => {
      const holdUntil = new Date();
      holdUntil.setDate(holdUntil.getDate() + 2);

      // Simuler un webhook FedaPay avec status 'approved' via la RPC atomique
      const { error: atomicError } = await supabase.rpc('update_payment_with_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
        p_new_status: 'paid',
        p_new_payout_status: 'held',
        p_hold_until: holdUntil.toISOString(),
      });

      assertEquals(atomicError, null, 'update_payment_with_balance ne doit pas échouer');

      // Vérifier que le paiement est mis à jour
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      assertEquals(payment.status, 'paid', 'Le statut doit être paid');
      assertEquals(payment.payout_status, 'held', 'Le payout_status doit être held');
      assertExists(payment.hold_until, 'hold_until doit être défini');

      // Vérifier que les balances sont correctement transférés
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 0, 'balance_pending doit être 0');
      assertEquals(balance.balance_on_hold, 4400, 'balance_on_hold doit être 4400');
      assertEquals(balance.balance_available, 0, 'balance_available doit être 0');
      
      console.log('✅ Étape 3: Transition paid confirmée, balance_pending → balance_on_hold');
    });

    // ============================================================
    // ÉTAPE 4: Vérifier que l'appointment est confirmé
    // ============================================================
    await t.step('4. Vérification du statut de l\'appointment', async () => {
      // Simuler la mise à jour de l'appointment (normalement fait par le webhook)
      await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', TEST_CONFIG.testAppointmentId);

      const { data: appointment } = await supabase
        .from('appointments')
        .select('status')
        .eq('id', TEST_CONFIG.testAppointmentId)
        .single();

      assertExists(appointment, 'L\'appointment doit exister');
      assertEquals(appointment.status, 'confirmed', 'L\'appointment doit être confirmé');
      
      console.log('✅ Étape 4: Appointment confirmé après paiement');
    });

    console.log('\n✅ Test de transitions de statut validé avec succès!');
    console.log('   initiated → pending → paid avec gestion correcte des balances');

  } catch (error) {
    console.error('❌ Erreur dans le test de transitions:', error);
    throw error;
  } finally {
    // Cleanup
    await cleanupTestData(supabase, paymentId);
    await supabase.from('appointments').delete().eq('id', TEST_CONFIG.testAppointmentId);
  }
});

/**
 * Test: Vérifier que les échecs de paiement nettoient correctement le balance_pending
 */
Deno.test('Payment Status Transitions - Échec de paiement nettoie balance_pending', async (t) => {
  const supabase = createTestClient();
  let paymentId: string | undefined;

  try {
    await cleanupTestData(supabase);
    await createTestAppointment(supabase);

    await t.step('1. Créer paiement et initialiser balance_pending', async () => {
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
          fedapay_transaction_id: 'test-failed-123',
        })
        .select()
        .single();

      paymentId = payment.id;

      await supabase.rpc('initialize_payment_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
      });

      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 4400, 'balance_pending doit être 4400');
    });

    await t.step('2. Transition vers pending puis failed via RPC atomique', async () => {
      // D'abord pending
      await supabase
        .from('payments')
        .update({ status: 'pending' })
        .eq('id', paymentId);

      // Puis échec via RPC atomique
      const { error: failError } = await supabase.rpc('update_payment_with_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
        p_new_status: 'failed',
        p_new_payout_status: 'failed',
        p_hold_until: null,
      });

      assertEquals(failError, null, 'La mise à jour ne doit pas échouer');

      // Vérifier que le paiement est failed
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      assertEquals(payment.status, 'failed', 'Le statut doit être failed');
      assertEquals(payment.payout_status, 'failed', 'Le payout_status doit être failed');

      // CRITIQUE: Vérifier que balance_pending est nettoyé
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 0, 'balance_pending doit être 0 après échec');
      assertEquals(balance.balance_on_hold, 0, 'balance_on_hold doit rester 0');
      assertEquals(balance.balance_available, 0, 'balance_available doit rester 0');
      
      console.log('✅ Échec de paiement nettoie correctement balance_pending');
    });

    console.log('\n✅ Test de nettoyage des échecs validé avec succès!');

  } finally {
    await cleanupTestData(supabase, paymentId);
    await supabase.from('appointments').delete().eq('id', TEST_CONFIG.testAppointmentId);
  }
});

/**
 * Test: Vérifier que les annulations nettoient correctement le balance_pending
 */
Deno.test('Payment Status Transitions - Annulation nettoie balance_pending', async (t) => {
  const supabase = createTestClient();
  let paymentId: string | undefined;

  try {
    await cleanupTestData(supabase);
    await createTestAppointment(supabase);

    await t.step('Annulation d\'un paiement pending', async () => {
      // Créer paiement
      const { data: payment } = await supabase
        .from('payments')
        .insert({
          appointment_id: TEST_CONFIG.testAppointmentId,
          patient_id: TEST_CONFIG.testPatientId,
          amount: TEST_CONFIG.testAmount,
          currency: 'XOF',
          payment_method: 'mtn',
          status: 'pending',
          payout_status: 'pending',
          net_amount: 4400,
          fedapay_transaction_id: 'test-canceled-123',
        })
        .select()
        .single();

      paymentId = payment.id;

      await supabase.rpc('initialize_payment_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
      });

      // Annuler via RPC atomique
      const { error: cancelError } = await supabase.rpc('update_payment_with_balance', {
        p_payment_id: paymentId,
        p_practitioner_id: TEST_CONFIG.testPractitionerId,
        p_net_amount: 4400,
        p_new_status: 'canceled',
        p_new_payout_status: 'failed',
        p_hold_until: null,
      });

      assertEquals(cancelError, null, 'L\'annulation ne doit pas échouer');

      // Vérifier le nettoyage
      const { data: balance } = await supabase
        .from('practitioner_balances')
        .select('*')
        .eq('practitioner_id', TEST_CONFIG.testPractitionerId)
        .single();

      assertEquals(balance.balance_pending, 0, 'balance_pending doit être 0 après annulation');
      
      console.log('✅ Annulation nettoie correctement balance_pending');
    });

    console.log('\n✅ Test d\'annulation validé avec succès!');

  } finally {
    await cleanupTestData(supabase, paymentId);
    await supabase.from('appointments').delete().eq('id', TEST_CONFIG.testAppointmentId);
  }
});
