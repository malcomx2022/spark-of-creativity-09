import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables à exporter dans l'ordre des dépendances
const TABLES_ORDER = [
  // Niveau 1 - Sans dépendances
  "profiles",
  "services",
  "system_config",
  "consent_versions",
  "faqs",
  
  // Niveau 2 - Dépendent des profils
  "practitioners",
  "addresses",
  "emergency_contacts",
  "medical_profiles",
  "notification_preferences",
  "consents",
  "user_roles",
  "push_subscriptions",
  "triage_results",
  "support_tickets",
  
  // Niveau 3 - Dépendent des praticiens
  "practitioner_availability",
  "practitioner_availability_exceptions",
  "practitioner_rates",
  "practitioner_balances",
  "practitioner_payment_info",
  "group_sessions",
  "ledger_accounts",
  "payout_batches",
  
  // Niveau 4 - Rendez-vous et paiements
  "appointments",
  "payments",
  "group_session_participants",
  "payouts",
  
  // Niveau 5 - Données transactionnelles
  "payment_events",
  "payment_attempts",
  "notifications",
  "ledger_entries",
  "messages",
  "admin_audit_logs",
  "reviews",
  "care_notes",
  "consultation_reports",
  "disputes",
  "refunds",
  "webhook_events",
  
  // Niveau 6 - Logs et audit
  "otp_attempts",
  "otp_rate_limits",
  "file_access_logs",
  "files",
  "search_activity_logs",
  "care_notes_sharing_log",
  "service_audit_log",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Vérifier l'authentification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier que l'utilisateur est super_admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Super admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action } = await req.json();

    if (action === "list_tables") {
      // Lister les tables avec leurs comptages
      const tableCounts: Record<string, number> = {};
      
      for (const table of TABLES_ORDER) {
        try {
          const { count } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });
          tableCounts[table] = count || 0;
        } catch {
          tableCounts[table] = -1; // Table n'existe pas ou erreur
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          tables: tableCounts,
          total_tables: Object.keys(tableCounts).filter(k => tableCounts[k] >= 0).length,
          total_rows: Object.values(tableCounts).filter(v => v > 0).reduce((a, b) => a + b, 0)
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "export_all") {
      const exportData: Record<string, unknown[]> = {};
      const errors: Record<string, string> = {};
      
      for (const table of TABLES_ORDER) {
        try {
          const { data, error } = await supabase
            .from(table)
            .select("*");
          
          if (error) {
            errors[table] = error.message;
          } else {
            exportData[table] = data || [];
          }
        } catch (e) {
          errors[table] = e instanceof Error ? e.message : "Unknown error";
        }
      }

      // Exporter aussi les utilisateurs auth (métadonnées seulement)
      const { data: authUsers, error: authUsersError } = await supabase.auth.admin.listUsers();
      
      const authUsersExport = authUsersError ? [] : authUsers.users.map(u => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        email_confirmed_at: u.email_confirmed_at,
        phone_confirmed_at: u.phone_confirmed_at,
        created_at: u.created_at,
        updated_at: u.updated_at,
        last_sign_in_at: u.last_sign_in_at,
        raw_user_meta_data: u.user_metadata,
        raw_app_meta_data: u.app_metadata,
        // Note: encrypted_password n'est PAS accessible via l'API
      }));

      const exportResult = {
        exported_at: new Date().toISOString(),
        source_project: Deno.env.get("SUPABASE_URL"),
        tables: exportData,
        auth_users: authUsersExport,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
        stats: {
          tables_exported: Object.keys(exportData).length,
          total_rows: Object.values(exportData).reduce((sum, arr) => sum + arr.length, 0),
          auth_users_count: authUsersExport.length,
        }
      };

      return new Response(
        JSON.stringify(exportResult, null, 2),
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="domicares-export-${new Date().toISOString().split('T')[0]}.json"`
          } 
        }
      );
    }

    if (action === "export_table") {
      const { table_name } = await req.json();
      
      if (!table_name || !TABLES_ORDER.includes(table_name)) {
        return new Response(
          JSON.stringify({ error: "Invalid table name" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabase
        .from(table_name)
        .select("*");

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          table: table_name, 
          count: data?.length || 0, 
          data 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: "Invalid action. Use: list_tables, export_all, or export_table" 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Export error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Export failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
