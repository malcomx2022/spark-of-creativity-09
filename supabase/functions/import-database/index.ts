import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Ordre d'import (respecte les dépendances FK)
const IMPORT_ORDER = [
  "profiles",
  "services", 
  "system_config",
  "consent_versions",
  "faqs",
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
  "practitioner_availability",
  "practitioner_availability_exceptions",
  "practitioner_rates",
  "practitioner_balances",
  "practitioner_payment_info",
  "group_sessions",
  "ledger_accounts",
  "payout_batches",
  "appointments",
  "payments",
  "group_session_participants",
  "payouts",
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
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Cette fonction doit être appelée avec les credentials de la NOUVELLE base
    const targetUrl = req.headers.get("X-Target-Supabase-Url");
    const targetServiceKey = req.headers.get("X-Target-Service-Role-Key");

    if (!targetUrl || !targetServiceKey) {
      return new Response(
        JSON.stringify({ 
          error: "Missing target database credentials",
          required_headers: ["X-Target-Supabase-Url", "X-Target-Service-Role-Key"]
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetSupabase = createClient(targetUrl, targetServiceKey);

    // Vérifier la connexion à la cible
    const { error: pingError } = await targetSupabase.from("profiles").select("id").limit(1);
    if (pingError && !pingError.message.includes("0 rows")) {
      return new Response(
        JSON.stringify({ error: "Cannot connect to target database", details: pingError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, data: importData, auth_users } = body;

    if (action === "import_auth_users") {
      // Créer les utilisateurs dans la nouvelle base
      if (!auth_users || !Array.isArray(auth_users)) {
        return new Response(
          JSON.stringify({ error: "auth_users array required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results = {
        created: [] as string[],
        failed: [] as { email: string; error: string }[],
      };

      for (const user of auth_users) {
        try {
          // Créer l'utilisateur avec un mot de passe temporaire
          // L'utilisateur devra faire "Forgot Password" pour définir un nouveau mot de passe
          const tempPassword = crypto.randomUUID() + "Aa1!";
          
          const { data: newUser, error } = await targetSupabase.auth.admin.createUser({
            email: user.email,
            phone: user.phone,
            email_confirm: true, // Marquer comme confirmé
            phone_confirm: !!user.phone_confirmed_at,
            password: tempPassword,
            user_metadata: user.raw_user_meta_data || {},
            app_metadata: user.raw_app_meta_data || {},
          });

          if (error) {
            results.failed.push({ email: user.email, error: error.message });
          } else {
            results.created.push(user.email);
            
            // Note: L'ID sera différent dans la nouvelle base
            // Il faudra mettre à jour les références dans les autres tables
          }
        } catch (e) {
          results.failed.push({ 
            email: user.email, 
            error: e instanceof Error ? e.message : "Unknown error" 
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          results,
          note: "Users created with temporary passwords. They must use 'Forgot Password' to set new passwords."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "import_tables") {
      if (!importData || typeof importData !== "object") {
        return new Response(
          JSON.stringify({ error: "tables data object required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: Record<string, { inserted: number; errors: string[] }> = {};

      // Importer dans l'ordre des dépendances
      for (const tableName of IMPORT_ORDER) {
        const tableData = importData[tableName];
        
        if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
          results[tableName] = { inserted: 0, errors: [] };
          continue;
        }

        const errors: string[] = [];
        let inserted = 0;

        // Insérer par lots de 100
        const batchSize = 100;
        for (let i = 0; i < tableData.length; i += batchSize) {
          const batch = tableData.slice(i, i + batchSize);
          
          const { error } = await targetSupabase
            .from(tableName)
            .upsert(batch, { 
              onConflict: "id",
              ignoreDuplicates: false 
            });

          if (error) {
            errors.push(`Batch ${Math.floor(i / batchSize)}: ${error.message}`);
          } else {
            inserted += batch.length;
          }
        }

        results[tableName] = { inserted, errors };
      }

      const totalInserted = Object.values(results).reduce((sum, r) => sum + r.inserted, 0);
      const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);

      return new Response(
        JSON.stringify({
          success: totalErrors === 0,
          total_inserted: totalInserted,
          total_errors: totalErrors,
          details: results
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "import_single_table") {
      const { table_name, table_data } = body;
      
      if (!table_name || !table_data || !Array.isArray(table_data)) {
        return new Response(
          JSON.stringify({ error: "table_name and table_data array required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await targetSupabase
        .from(table_name)
        .upsert(table_data, { onConflict: "id" });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          table: table_name, 
          inserted: table_data.length 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: "Invalid action. Use: import_auth_users, import_tables, or import_single_table" 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Import error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Import failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
