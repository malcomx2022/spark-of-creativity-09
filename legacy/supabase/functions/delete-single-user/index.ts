import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Vérifier que l'appelant est authentifié et est un admin autorisé
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier que l'appelant a un rôle admin autorisé (super_admin ou ops)
    const { data: callerRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleError || !callerRole) {
      console.error("Tentative de suppression non autorisée par:", caller.email);
      return new Response(
        JSON.stringify({ error: "Non autorisé - Rôle admin requis" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Seuls super_admin et ops peuvent supprimer des utilisateurs
    const authorizedRoles = ["super_admin", "ops"];
    if (!authorizedRoles.includes(callerRole.role)) {
      console.error("Rôle insuffisant pour suppression:", callerRole.role);
      return new Response(
        JSON.stringify({ error: "Rôle insuffisant pour cette opération" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, userType } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId est requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Suppression de l'utilisateur ${userId} (type: ${userType}) par ${caller.email}`);

    // Vérifier que ce n'est pas un compte test
    const { data: authUser, error: getUserError } = await supabase.auth.admin.getUserById(userId);
    
    if (getUserError) {
      console.error("Erreur récupération utilisateur:", getUserError);
      return new Response(
        JSON.stringify({ error: "Utilisateur non trouvé" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (authUser?.user?.email?.includes("@test.com")) {
      return new Response(
        JSON.stringify({ error: "Impossible de supprimer un compte test" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Si c'est un praticien, supprimer d'abord ses données liées
    if (userType === 'practitioner') {
      // Récupérer l'ID du praticien
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (practitioner) {
        const practitionerId = practitioner.id;
        console.log(`Praticien trouvé: ${practitionerId}`);

        // Supprimer les données liées au praticien
        await supabase.from('practitioner_availability').delete().eq('practitioner_id', practitionerId);
        await supabase.from('practitioner_exceptions').delete().eq('practitioner_id', practitionerId);
        await supabase.from('practitioner_rates').delete().eq('practitioner_id', practitionerId);
        await supabase.from('practitioner_payment_info').delete().eq('practitioner_id', practitionerId);
        await supabase.from('practitioner_balances').delete().eq('practitioner_id', practitionerId);
        await supabase.from('care_notes').delete().eq('practitioner_id', practitionerId);
        await supabase.from('consultation_reports').delete().eq('practitioner_id', practitionerId);
        
        // Supprimer les participants des séances de groupe du coach
        const { data: groupSessions } = await supabase
          .from('group_sessions')
          .select('id')
          .eq('coach_id', practitionerId);
        
        if (groupSessions && groupSessions.length > 0) {
          const sessionIds = groupSessions.map(s => s.id);
          await supabase.from('group_session_participants').delete().in('session_id', sessionIds);
        }
        
        await supabase.from('group_sessions').delete().eq('coach_id', practitionerId);
        await supabase.from('practitioner_payouts').delete().eq('practitioner_id', practitionerId);
        
        // Supprimer le praticien
        await supabase.from('practitioners').delete().eq('id', practitionerId);
        console.log(`Praticien ${practitionerId} supprimé`);
      }
    }

    // Supprimer les données communes à tous les utilisateurs
    await supabase.from('addresses').delete().eq('user_id', userId);
    await supabase.from('emergency_contacts').delete().eq('user_id', userId);
    await supabase.from('medical_profiles').delete().eq('user_id', userId);
    await supabase.from('notification_preferences').delete().eq('user_id', userId);
    await supabase.from('consents').delete().eq('user_id', userId);
    await supabase.from('notifications').delete().eq('user_id', userId);
    await supabase.from('saved_payment_methods').delete().eq('user_id', userId);
    await supabase.from('payment_attempts').delete().eq('user_id', userId);
    await supabase.from('files').delete().eq('user_id', userId);
    await supabase.from('triage_results').delete().eq('user_id', userId);
    await supabase.from('support_tickets').delete().eq('user_id', userId);
    
    // Supprimer les paiements
    await supabase.from('payments').delete().eq('patient_id', userId);
    
    // Supprimer les reviews
    await supabase.from('reviews').delete().eq('patient_id', userId);
    
    // Supprimer les rendez-vous
    await supabase.from('appointments').delete().eq('patient_id', userId);
    
    // Supprimer les disputes
    await supabase.from('disputes').delete().eq('raised_by', userId);
    
    // Supprimer les rôles
    await supabase.from('user_roles').delete().eq('user_id', userId);
    
    // Supprimer le profil
    await supabase.from('profiles').delete().eq('id', userId);
    console.log(`Profil ${userId} supprimé`);

    // Logger l'audit AVANT suppression de l'utilisateur auth
    await supabase.from('admin_audit_logs').insert({
      admin_id: caller.id,
      action: `delete_${userType || 'user'}`,
      entity_type: userType || 'user',
      entity_id: userId,
      details: { deleted_by: caller.email },
    });

    // Supprimer l'utilisateur auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    
    if (deleteError) {
      console.error("Erreur suppression auth:", deleteError);
      return new Response(
        JSON.stringify({ error: `Erreur lors de la suppression: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Utilisateur ${userId} complètement supprimé`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Utilisateur supprimé avec succès`,
        userId 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erreur:", error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
