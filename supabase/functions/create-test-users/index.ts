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
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Créer le patient
    const { data: patientUser, error: patientError } = await supabaseAdmin.auth.admin.createUser({
      email: 'patient@test.com',
      password: 'Patient123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Patient Test',
      },
    });

    if (patientError && patientError.message !== 'A user with this email address has already been registered') {
      throw patientError;
    }

    if (patientUser?.user) {
      await supabaseAdmin.from('profiles').upsert({
        id: patientUser.user.id,
        full_name: 'Patient Test',
        phone: '+22967000001',
        gender: 'masculin',
        date_of_birth: '1990-01-01',
      }, { onConflict: 'id' });
    }

    // Créer le praticien
    const { data: practitionerUser, error: practitionerError } = await supabaseAdmin.auth.admin.createUser({
      email: 'praticien@test.com',
      password: 'Praticien123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Dr. Praticien Test',
      },
    });

    if (practitionerError && practitionerError.message !== 'A user with this email address has already been registered') {
      throw practitionerError;
    }

    if (practitionerUser?.user) {
      await supabaseAdmin.from('profiles').upsert({
        id: practitionerUser.user.id,
        full_name: 'Dr. Praticien Test',
        phone: '+22967000002',
        gender: 'masculin',
        date_of_birth: '1985-01-01',
      }, { onConflict: 'id' });

      await supabaseAdmin.from('practitioners').upsert({
        user_id: practitionerUser.user.id,
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
        kyc_status: 'validated',
        can_accept_missions: true,
      }, { onConflict: 'user_id' });
    }

    // Créer l'admin
    const { data: adminUser, error: adminError } = await supabaseAdmin.auth.admin.createUser({
      email: 'admin@test.com',
      password: 'Admin123!',
      email_confirm: true,
      user_metadata: {
        full_name: 'Admin Test',
      },
    });

    if (adminError && adminError.message !== 'A user with this email address has already been registered') {
      throw adminError;
    }

    if (adminUser?.user) {
      await supabaseAdmin.from('profiles').upsert({
        id: adminUser.user.id,
        full_name: 'Admin Test',
        phone: '+22967000003',
        gender: 'masculin',
        date_of_birth: '1980-01-01',
      }, { onConflict: 'id' });

      await supabaseAdmin.from('user_roles').upsert({
        user_id: adminUser.user.id,
        role: 'super_admin',
      }, { onConflict: 'user_id' });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Comptes de test créés avec succès',
        accounts: {
          patient: { email: 'patient@test.com', password: 'Patient123!' },
          praticien: { email: 'praticien@test.com', password: 'Praticien123!' },
          admin: { email: 'admin@test.com', password: 'Admin123!' },
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error creating test users:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
