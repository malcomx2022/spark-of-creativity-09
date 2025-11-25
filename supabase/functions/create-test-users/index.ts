import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Optional authentication check: If user is authenticated, verify they are super_admin
    // This allows both unauthenticated access (for initial setup) and authenticated super_admin access
    const authHeader = req.headers.get('Authorization');
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });

      const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
      
      if (user) {
        // User is authenticated, verify they are super_admin
        const { data: roles, error: roleError } = await supabaseUser
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super_admin')
          .single();

        if (roleError || !roles) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Super admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log(`Admin ${user.email} is creating test users`);
      } else {
        console.log('Unauthenticated request - allowing for initial setup');
      }
    } else {
      console.log('No auth header - allowing for initial setup');
    }
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('Starting test user creation...');
    const results = {
      patient: null as any,
      praticien: null as any,
      coach: null as any,
      admin: null as any,
    };

    // Créer le patient
    try {
      console.log('Creating patient user...');
      const { data: patientData, error: patientError } = await supabaseAdmin.auth.admin.createUser({
        email: 'patient@test.com',
        password: 'Patient123!',
        email_confirm: true,
        user_metadata: {
          full_name: 'Patient Test',
        },
      });

      if (patientError) {
        console.error('Patient creation error:', patientError);
        if (patientError.message.includes('already been registered')) {
          console.log('Patient already exists, updating...');
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = users.users.find(u => u.email === 'patient@test.com');
          if (existingUser) {
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password: 'Patient123!',
              email_confirm: true,
            });
            results.patient = existingUser.id;
          }
        }
      } else {
        console.log('Patient created:', patientData.user.id);
        results.patient = patientData.user.id;
      }

      if (results.patient) {
        console.log('Creating patient profile...');
        const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
          id: results.patient,
          full_name: 'Patient Test',
          phone: '+22967000001',
          gender: 'homme',
          date_of_birth: '1990-01-01',
        }, { onConflict: 'id' });
        if (profileError) console.error('Patient profile error:', profileError);
      }
    } catch (e) {
      console.error('Patient creation exception:', e);
    }

    // Créer le praticien
    try {
      console.log('Creating practitioner user...');
      const { data: practitionerData, error: practitionerError } = await supabaseAdmin.auth.admin.createUser({
        email: 'praticien@test.com',
        password: 'Praticien123!',
        email_confirm: true,
        user_metadata: {
          full_name: 'Dr. Praticien Test',
        },
      });

      if (practitionerError) {
        console.error('Practitioner creation error:', practitionerError);
        if (practitionerError.message.includes('already been registered')) {
          console.log('Practitioner already exists, updating...');
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = users.users.find(u => u.email === 'praticien@test.com');
          if (existingUser) {
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password: 'Praticien123!',
              email_confirm: true,
            });
            results.praticien = existingUser.id;
          }
        }
      } else {
        console.log('Practitioner created:', practitionerData.user.id);
        results.praticien = practitionerData.user.id;
      }

      if (results.praticien) {
        console.log('Creating practitioner profile...');
        const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
          id: results.praticien,
          full_name: 'Dr. Praticien Test',
          phone: '+22967000002',
          gender: 'homme',
          date_of_birth: '1985-01-01',
        }, { onConflict: 'id' });
        if (profileError) console.error('Practitioner profile error:', profileError);

        console.log('Creating practitioner entry...');
        const { error: practError } = await supabaseAdmin.from('practitioners').upsert({
          user_id: results.praticien,
          name: 'Dr. Praticien Test',
          specialty: 'Médecine Générale',
          phone: '+22967000002',
          address: 'Cotonou, Bénin',
          latitude: 6.3654,
          longitude: 2.4183,
          available: true,
          rating: 4.5,
          years_experience: 10,
          bio: 'Médecin généraliste expérimenté disponible pour consultations à domicile',
          kyc_status: 'pending',
          can_accept_missions: false,
          id_document_url: 'test-documents/id_test.pdf',
          license_document_url: 'test-documents/license_test.pdf',
          insurance_document_url: 'test-documents/insurance_test.pdf',
        }, { onConflict: 'user_id' });
        if (practError) console.error('Practitioner entry error:', practError);
      }
    } catch (e) {
      console.error('Practitioner creation exception:', e);
    }

    // Créer le coach sportif
    try {
      console.log('Creating coach user...');
      const { data: coachData, error: coachError } = await supabaseAdmin.auth.admin.createUser({
        email: 'coach@test.com',
        password: 'Coach123!',
        email_confirm: true,
        user_metadata: {
          full_name: 'Coach Sportif Test',
        },
      });

      if (coachError) {
        console.error('Coach creation error:', coachError);
        if (coachError.message.includes('already been registered')) {
          console.log('Coach already exists, updating...');
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = users.users.find(u => u.email === 'coach@test.com');
          if (existingUser) {
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password: 'Coach123!',
              email_confirm: true,
            });
            results.coach = existingUser.id;
          }
        }
      } else {
        console.log('Coach created:', coachData.user.id);
        results.coach = coachData.user.id;
      }

      if (results.coach) {
        console.log('Creating coach profile...');
        const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
          id: results.coach,
          full_name: 'Coach Sportif Test',
          phone: '+22967000004',
          gender: 'homme',
          date_of_birth: '1988-01-01',
        }, { onConflict: 'id' });
        if (profileError) console.error('Coach profile error:', profileError);

        console.log('Creating coach practitioner entry...');
        const { error: coachError } = await supabaseAdmin.from('practitioners').upsert({
          user_id: results.coach,
          name: 'Coach Sportif Test',
          specialty: 'Coaching Sportif',
          phone: '+22967000004',
          address: 'Cotonou, Bénin',
          latitude: 6.3654,
          longitude: 2.4183,
          available: true,
          rating: 4.8,
          years_experience: 7,
          bio: 'Coach sportif certifié spécialisé en préparation physique et nutrition',
          practitioner_type: 'coach_sportif',
          session_types: ['Remise en forme', 'Préparation physique', 'Nutrition'],
          intervention_zone: 'Cotonou et environs',
          intervention_radius: 15,
          certifications: ['Certificat de coach sportif', 'Nutrition sportive'],
          kyc_status: 'validated',
          can_accept_missions: true,
        }, { onConflict: 'user_id' });
        if (coachError) console.error('Coach practitioner entry error:', coachError);
      }
    } catch (e) {
      console.error('Coach creation exception:', e);
    }

    // Créer l'admin
    try {
      console.log('Creating admin user...');
      const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
        email: 'admin@test.com',
        password: 'Admin123!',
        email_confirm: true,
        user_metadata: {
          full_name: 'Admin Test',
        },
      });

      if (adminError) {
        console.error('Admin creation error:', adminError);
        if (adminError.message.includes('already been registered')) {
          console.log('Admin already exists, updating...');
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = users.users.find(u => u.email === 'admin@test.com');
          if (existingUser) {
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password: 'Admin123!',
              email_confirm: true,
            });
            results.admin = existingUser.id;
          }
        }
      } else {
        console.log('Admin created:', adminData.user.id);
        results.admin = adminData.user.id;
      }

      if (results.admin) {
        console.log('Creating admin profile...');
        const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
          id: results.admin,
          full_name: 'Admin Test',
          phone: '+22967000003',
          gender: 'homme',
          date_of_birth: '1980-01-01',
        }, { onConflict: 'id' });
        if (profileError) console.error('Admin profile error:', profileError);

        console.log('Creating admin role...');
        const { error: roleError } = await supabaseAdmin.from('user_roles').upsert({
          user_id: results.admin,
          role: 'super_admin',
        }, { onConflict: 'user_id,role' });
        if (roleError) console.error('Admin role error:', roleError);
      }
    } catch (e) {
      console.error('Admin creation exception:', e);
    }

    console.log('All users processed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Comptes de test créés ou mis à jour avec succès',
        accounts: {
          patient: { email: 'patient@test.com', password: 'Patient123!', created: !!results.patient },
          praticien: { email: 'praticien@test.com', password: 'Praticien123!', created: !!results.praticien },
          coach: { email: 'coach@test.com', password: 'Coach123!', created: !!results.coach },
          admin: { email: 'admin@test.com', password: 'Admin123!', created: !!results.admin },
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Global error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, details: error }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
