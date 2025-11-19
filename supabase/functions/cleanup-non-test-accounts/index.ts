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

    console.log('Starting cleanup of non-test accounts...');

    // Récupérer tous les utilisateurs avec @test.com
    const { data: allUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    const testUserIds = allUsers.users
      .filter(u => u.email?.includes('@test.com'))
      .map(u => u.id);

    console.log(`Found ${testUserIds.length} test accounts to preserve`);

    // Supprimer les praticiens non-test
    const { error: practitionersError } = await supabaseAdmin
      .from('practitioners')
      .delete()
      .not('user_id', 'in', `(${testUserIds.map(id => `'${id}'`).join(',')})`);

    if (practitionersError) {
      console.error('Error deleting practitioners:', practitionersError);
      throw practitionersError;
    }

    // Supprimer les profils non-test
    const { error: profilesError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .not('id', 'in', `(${testUserIds.map(id => `'${id}'`).join(',')})`);

    if (profilesError) {
      console.error('Error deleting profiles:', profilesError);
      throw profilesError;
    }

    // Supprimer les utilisateurs auth non-test
    const nonTestUsers = allUsers.users.filter(u => !u.email?.includes('@test.com'));
    
    for (const user of nonTestUsers) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteAuthError) {
        console.error(`Error deleting auth user ${user.id}:`, deleteAuthError);
      }
    }

    console.log(`Deleted ${nonTestUsers.length} non-test accounts`);

    // Logger l'action
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        admin_id: user.id,
        action: 'cleanup_non_test_accounts',
        entity_type: 'users',
        details: {
          test_accounts_preserved: testUserIds.length,
          accounts_deleted: nonTestUsers.length
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Suppression réussie. ${testUserIds.length} comptes test préservés, ${nonTestUsers.length} comptes supprimés.`,
        stats: {
          preserved: testUserIds.length,
          deleted: nonTestUsers.length
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
