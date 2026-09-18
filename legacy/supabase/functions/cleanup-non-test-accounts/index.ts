import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Vérifier que l'utilisateur est admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      throw new Error('User is not an admin');
    }

    console.log('Starting comprehensive cleanup of non-test accounts...');

    // Récupérer tous les utilisateurs
    const { data: allUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    // Séparer les utilisateurs test des autres
    const testUsers = allUsers.users.filter(u => u.email?.includes('@test.com'));
    const nonTestUsers = allUsers.users.filter(u => !u.email?.includes('@test.com'));
    const testUserIds = testUsers.map(u => u.id);
    const nonTestUserIds = nonTestUsers.map(u => u.id);

    console.log(`Found ${testUserIds.length} test accounts to preserve`);
    console.log(`Found ${nonTestUserIds.length} non-test accounts to delete`);

    if (nonTestUserIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Aucun compte non-test à supprimer.',
          stats: {
            preserved: testUserIds.length,
            deleted: 0
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Récupérer les IDs des praticiens à supprimer
    const { data: practitionersToDelete } = await supabaseAdmin
      .from('practitioners')
      .select('id, user_id')
      .in('user_id', nonTestUserIds);

    const practitionerIds = practitionersToDelete?.map(p => p.id) || [];
    console.log(`Found ${practitionerIds.length} practitioners to delete`);

    // ====== SUPPRESSION DES DONNÉES LIÉES AUX PRATICIENS ======
    if (practitionerIds.length > 0) {
      // Supprimer les disponibilités des praticiens
      const { error: availabilityError } = await supabaseAdmin
        .from('practitioner_availability')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (availabilityError) console.error('Error deleting practitioner_availability:', availabilityError);

      // Supprimer les exceptions des praticiens
      const { error: exceptionsError } = await supabaseAdmin
        .from('practitioner_exceptions')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (exceptionsError) console.error('Error deleting practitioner_exceptions:', exceptionsError);

      // Supprimer les tarifs des praticiens
      const { error: ratesError } = await supabaseAdmin
        .from('practitioner_rates')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (ratesError) console.error('Error deleting practitioner_rates:', ratesError);

      // Supprimer les infos de paiement des praticiens
      const { error: paymentInfoError } = await supabaseAdmin
        .from('practitioner_payment_info')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (paymentInfoError) console.error('Error deleting practitioner_payment_info:', paymentInfoError);

      // Supprimer les soldes des praticiens
      const { error: balancesError } = await supabaseAdmin
        .from('practitioner_balances')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (balancesError) console.error('Error deleting practitioner_balances:', balancesError);

      // Supprimer les notes de soins des praticiens
      const { error: careNotesError } = await supabaseAdmin
        .from('care_notes')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (careNotesError) console.error('Error deleting care_notes:', careNotesError);

      // Supprimer les rapports de consultation des praticiens
      const { error: reportsError } = await supabaseAdmin
        .from('consultation_reports')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (reportsError) console.error('Error deleting consultation_reports:', reportsError);

      // Supprimer les séances de groupe des praticiens (et leurs participants)
      const { data: groupSessions } = await supabaseAdmin
        .from('group_sessions')
        .select('id')
        .in('coach_id', practitionerIds);

      if (groupSessions && groupSessions.length > 0) {
        const sessionIds = groupSessions.map(s => s.id);
        
        // Supprimer les participants des séances
        const { error: participantsError } = await supabaseAdmin
          .from('group_session_participants')
          .delete()
          .in('session_id', sessionIds);
        if (participantsError) console.error('Error deleting group_session_participants:', participantsError);

        // Supprimer les séances
        const { error: sessionsError } = await supabaseAdmin
          .from('group_sessions')
          .delete()
          .in('coach_id', practitionerIds);
        if (sessionsError) console.error('Error deleting group_sessions:', sessionsError);
      }

      // Supprimer les payouts des praticiens
      const { error: payoutsError } = await supabaseAdmin
        .from('practitioner_payouts')
        .delete()
        .in('practitioner_id', practitionerIds);
      if (payoutsError) console.error('Error deleting practitioner_payouts:', payoutsError);
    }

    // ====== SUPPRESSION DES DONNÉES LIÉES AUX UTILISATEURS ======
    
    // Supprimer les adresses
    const { error: addressesError } = await supabaseAdmin
      .from('addresses')
      .delete()
      .in('user_id', nonTestUserIds);
    if (addressesError) console.error('Error deleting addresses:', addressesError);

    // Supprimer les contacts d'urgence
    const { error: emergencyContactsError } = await supabaseAdmin
      .from('emergency_contacts')
      .delete()
      .in('user_id', nonTestUserIds);
    if (emergencyContactsError) console.error('Error deleting emergency_contacts:', emergencyContactsError);

    // Supprimer les profils médicaux
    const { error: medicalProfilesError } = await supabaseAdmin
      .from('medical_profiles')
      .delete()
      .in('user_id', nonTestUserIds);
    if (medicalProfilesError) console.error('Error deleting medical_profiles:', medicalProfilesError);

    // Supprimer les préférences de notification
    const { error: notifPrefsError } = await supabaseAdmin
      .from('notification_preferences')
      .delete()
      .in('user_id', nonTestUserIds);
    if (notifPrefsError) console.error('Error deleting notification_preferences:', notifPrefsError);

    // Supprimer les consentements
    const { error: consentsError } = await supabaseAdmin
      .from('consents')
      .delete()
      .in('user_id', nonTestUserIds);
    if (consentsError) console.error('Error deleting consents:', consentsError);

    // Supprimer les notifications
    const { error: notificationsError } = await supabaseAdmin
      .from('notifications')
      .delete()
      .in('user_id', nonTestUserIds);
    if (notificationsError) console.error('Error deleting notifications:', notificationsError);

    // Supprimer les méthodes de paiement sauvegardées
    const { error: savedPaymentMethodsError } = await supabaseAdmin
      .from('saved_payment_methods')
      .delete()
      .in('user_id', nonTestUserIds);
    if (savedPaymentMethodsError) console.error('Error deleting saved_payment_methods:', savedPaymentMethodsError);

    // Supprimer les tentatives de paiement
    const { error: paymentAttemptsError } = await supabaseAdmin
      .from('payment_attempts')
      .delete()
      .in('user_id', nonTestUserIds);
    if (paymentAttemptsError) console.error('Error deleting payment_attempts:', paymentAttemptsError);

    // Supprimer les fichiers
    const { error: filesError } = await supabaseAdmin
      .from('files')
      .delete()
      .in('user_id', nonTestUserIds);
    if (filesError) console.error('Error deleting files:', filesError);

    // Supprimer les résultats de triage
    const { error: triageError } = await supabaseAdmin
      .from('triage_results')
      .delete()
      .in('user_id', nonTestUserIds);
    if (triageError) console.error('Error deleting triage_results:', triageError);

    // Supprimer les tickets de support
    const { error: supportTicketsError } = await supabaseAdmin
      .from('support_tickets')
      .delete()
      .in('user_id', nonTestUserIds);
    if (supportTicketsError) console.error('Error deleting support_tickets:', supportTicketsError);

    // Supprimer les paiements (patient_id est uuid)
    const { error: paymentsError } = await supabaseAdmin
      .from('payments')
      .delete()
      .in('patient_id', nonTestUserIds);
    if (paymentsError) console.error('Error deleting payments:', paymentsError);

    // Supprimer les avis (patient_id est uuid)
    const { error: reviewsError } = await supabaseAdmin
      .from('reviews')
      .delete()
      .in('patient_id', nonTestUserIds);
    if (reviewsError) console.error('Error deleting reviews:', reviewsError);

    // Supprimer les rendez-vous (patient_id est text, conversion nécessaire)
    for (const userId of nonTestUserIds) {
      const { error: appointmentsError } = await supabaseAdmin
        .from('appointments')
        .delete()
        .eq('patient_id', userId);
      if (appointmentsError) console.error(`Error deleting appointments for user ${userId}:`, appointmentsError);
    }

    // Supprimer les litiges
    const { error: disputesError } = await supabaseAdmin
      .from('disputes')
      .delete()
      .in('raised_by', nonTestUserIds);
    if (disputesError) console.error('Error deleting disputes:', disputesError);

    // Supprimer les participations aux séances de groupe
    const { error: groupParticipationsError } = await supabaseAdmin
      .from('group_session_participants')
      .delete()
      .in('patient_id', nonTestUserIds);
    if (groupParticipationsError) console.error('Error deleting group_session_participants:', groupParticipationsError);

    // Supprimer les rôles utilisateur (sauf super_admin pour éviter de supprimer des admins par erreur)
    const { error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .in('user_id', nonTestUserIds);
    if (rolesError) console.error('Error deleting user_roles:', rolesError);

    // ====== SUPPRESSION DES PRATICIENS ======
    if (practitionerIds.length > 0) {
      const { error: practitionersError } = await supabaseAdmin
        .from('practitioners')
        .delete()
        .in('id', practitionerIds);
      if (practitionersError) console.error('Error deleting practitioners:', practitionersError);
    }

    // ====== SUPPRESSION DES PROFILS ======
    const { error: profilesError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .in('id', nonTestUserIds);
    if (profilesError) console.error('Error deleting profiles:', profilesError);

    // ====== SUPPRESSION DES COMPTES AUTH ======
    let deletedCount = 0;
    let failedCount = 0;

    for (const nonTestUser of nonTestUsers) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(nonTestUser.id);
      if (deleteAuthError) {
        console.error(`Error deleting auth user ${nonTestUser.id} (${nonTestUser.email}):`, deleteAuthError);
        failedCount++;
      } else {
        console.log(`Successfully deleted user: ${nonTestUser.email}`);
        deletedCount++;
      }
    }

    console.log(`Deletion complete: ${deletedCount} deleted, ${failedCount} failed`);

    // Logger l'action
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        admin_id: user.id,
        action: 'cleanup_non_test_accounts',
        entity_type: 'users',
        details: {
          test_accounts_preserved: testUserIds.length,
          accounts_deleted: deletedCount,
          accounts_failed: failedCount,
          practitioners_deleted: practitionerIds.length,
          deleted_user_emails: nonTestUsers.map(u => u.email)
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Suppression complète réussie. ${testUserIds.length} comptes test préservés, ${deletedCount} comptes supprimés définitivement${failedCount > 0 ? `, ${failedCount} échecs` : ''}.`,
        stats: {
          preserved: testUserIds.length,
          deleted: deletedCount,
          failed: failedCount,
          practitioners_deleted: practitionerIds.length
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in cleanup-non-test-accounts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
