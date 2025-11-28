import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateAdminRequest {
  email: string;
  role: 'super_admin' | 'ops' | 'finance' | 'compliance' | 'support' | 'analyst';
  fullName: string;
  phone?: string;
}

interface ResetPasswordRequest {
  userId: string;
}

interface DisableAdminRequest {
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Client avec service role pour opérations admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Vérifier que l'appelant est un admin
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier que l'utilisateur a un rôle admin
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError || !userRole) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;

    console.log('Admin action:', action, 'by user:', user.email);

    switch (action) {
      case 'create': {
        const { email, role, fullName, phone } = body as CreateAdminRequest & { action: string };

        if (!email || !role || !fullName) {
          return new Response(
            JSON.stringify({ error: 'Email, nom complet et rôle requis' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Seul super_admin peut créer d'autres admins
        if (userRole.role !== 'super_admin') {
          return new Response(
            JSON.stringify({ error: 'Seuls les super admins peuvent créer des administrateurs' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Vérifier si l'utilisateur existe déjà (paginated search)
        let existingUser = null;
        let page = 0;
        let hasMore = true;
        
        while (hasMore && !existingUser) {
          const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({
            page: page,
            perPage: 1000
          });
          
          existingUser = usersPage?.users.find(u => u.email === email);
          hasMore = (usersPage?.users.length ?? 0) === 1000;
          page++;
        }

        let userId: string;
        let tempPassword: string | undefined;
        let isNewUser = false;

        if (existingUser) {
          console.log('User already exists, checking role...');
          
          // Vérifier si l'utilisateur a déjà un rôle admin
          const { data: existingRole } = await supabaseAdmin
            .from('user_roles')
            .select('role')
            .eq('user_id', existingUser.id)
            .maybeSingle();

          if (existingRole) {
            return new Response(
              JSON.stringify({ error: 'Cet utilisateur est déjà administrateur' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          userId = existingUser.id;
          
          // Mettre à jour le profil existant avec les nouvelles infos
          const { error: updateProfileError } = await supabaseAdmin
            .from('profiles')
            .update({
              full_name: fullName,
              phone: phone || null,
            })
            .eq('id', userId);

          if (updateProfileError) {
            console.error('Error updating profile:', updateProfileError);
          }
        } else {
          // Générer un mot de passe temporaire
          tempPassword = crypto.randomUUID();
          isNewUser = true;

          // Créer l'utilisateur
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
          });

          if (createError || !newUser.user) {
            console.error('Error creating user:', createError);
            return new Response(
              JSON.stringify({ error: createError?.message || 'Erreur lors de la création' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          userId = newUser.user.id;

          // Créer le profil complet
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
              id: userId,
              full_name: fullName,
              phone: phone || null,
            });

          if (profileError) {
            console.error('Error creating profile:', profileError);
          }
        }

        // Assigner le rôle admin
        const { error: roleInsertError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: userId,
            role,
            created_by: user.id,
          });

        if (roleInsertError) {
          console.error('Error assigning role:', roleInsertError);
          // Supprimer l'utilisateur seulement si on vient de le créer
          if (isNewUser) {
            await supabaseAdmin.auth.admin.deleteUser(userId);
          }
          return new Response(
            JSON.stringify({ error: 'Erreur lors de l\'assignation du rôle' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Logger l'audit
        await supabaseAdmin.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'create_admin',
          entity_type: 'user',
          entity_id: userId,
          details: { email, role },
        });

        console.log('Admin created successfully:', email);

        const responseData: any = { 
          success: true, 
          userId: userId,
          message: isNewUser 
            ? 'Admin créé avec succès. Mot de passe temporaire généré.' 
            : 'Rôle admin ajouté à l\'utilisateur existant'
        };
        
        if (tempPassword) {
          responseData.tempPassword = tempPassword;
        }

        return new Response(
          JSON.stringify(responseData),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reset_password': {
        const { userId } = body as ResetPasswordRequest & { action: string };

        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'ID utilisateur requis' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Générer un nouveau mot de passe
        const newPassword = crypto.randomUUID();

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

        if (updateError) {
          console.error('Error resetting password:', updateError);
          return new Response(
            JSON.stringify({ error: 'Erreur lors de la réinitialisation' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Logger l'audit
        await supabaseAdmin.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'reset_password',
          entity_type: 'user',
          entity_id: userId,
        });

        console.log('Password reset for user:', userId);

        return new Response(
          JSON.stringify({ 
            success: true, 
            newPassword,
            message: 'Mot de passe réinitialisé avec succès' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'disable': {
        const { userId } = body as DisableAdminRequest & { action: string };

        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'ID utilisateur requis' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Empêcher la désactivation de soi-même
        if (userId === user.id) {
          return new Response(
            JSON.stringify({ error: 'Vous ne pouvez pas vous désactiver vous-même' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Supprimer l'utilisateur (soft delete via Supabase)
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
          console.error('Error disabling user:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Erreur lors de la désactivation' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Logger l'audit
        await supabaseAdmin.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'disable_admin',
          entity_type: 'user',
          entity_id: userId,
        });

        console.log('Admin disabled:', userId);

        return new Response(
          JSON.stringify({ success: true, message: 'Admin désactivé avec succès' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Action non reconnue' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in admin-management function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
