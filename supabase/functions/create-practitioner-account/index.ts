import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreatePractitionerRequest {
  userId: string;
  profileData: any;
  practitionerData: any;
  documents: Record<string, string>; // base64 encoded files
}

async function uploadDocument(
  supabase: any,
  base64Data: string,
  fileName: string,
  userId: string
): Promise<{ path: string; url: string }> {
  // Extract file data from base64
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 data');
  }

  const contentType = matches[1];
  const base64Content = matches[2];
  
  // Decode base64
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const filePath = `practitioner-documents/${userId}/${fileName}`;

  // Upload to Wasabi via Supabase edge function
  const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
    'upload-to-wasabi',
    {
      body: {
        file: Array.from(bytes),
        fileName: filePath,
        contentType,
      }
    }
  );

  if (uploadError) {
    console.error('Erreur upload Wasabi:', uploadError);
    throw uploadError;
  }

  return {
    path: filePath,
    url: uploadData.url,
  };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: CreatePractitionerRequest = await req.json();
    const { userId, profileData, practitionerData, documents } = body;

    console.log('🚀 Création compte praticien transactionnelle:', userId);

    // Variables pour rollback
    let profileCreated = false;
    let uploadedDocuments: string[] = [];

    try {
      // 1. Créer le profil
      console.log('📝 Création profil...');
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([profileData]);

      if (profileError) {
        console.error('❌ Erreur profil:', profileError);
        throw new Error(`Échec création profil: ${profileError.message}`);
      }
      profileCreated = true;
      console.log('✅ Profil créé');

      // 2. Upload des documents
      console.log('📤 Upload documents...');
      const uploadedDocs: Record<string, any> = {};
      
      for (const [key, base64Data] of Object.entries(documents)) {
        if (base64Data) {
          try {
            const ext = base64Data.includes('pdf') ? 'pdf' : 'jpg';
            const fileName = `${key}_${Date.now()}.${ext}`;
            const result = await uploadDocument(supabase, base64Data, fileName, userId);
            uploadedDocs[key] = result;
            uploadedDocuments.push(result.path);
            console.log(`✅ ${key} uploadé`);
          } catch (uploadError: any) {
            console.error(`❌ Erreur upload ${key}:`, uploadError);
            throw new Error(`Échec upload ${key}: ${uploadError?.message || 'Erreur inconnue'}`);
          }
        }
      }

      // 3. Créer l'entrée practitioners
      console.log('👨‍⚕️ Création praticien...');
      const practitionerPayload = {
        ...practitionerData,
        image: uploadedDocs.profilePhoto?.url || null,
        id_document_url: uploadedDocs.idDocument?.path || null,
        license_document_url: uploadedDocs.licenseDocument?.path || null,
        diplomas: uploadedDocs.diploma ? [uploadedDocs.diploma.path] : null,
      };

      const { error: practitionerError } = await supabase
        .from('practitioners')
        .insert([practitionerPayload]);

      if (practitionerError) {
        console.error('❌ Erreur praticien:', practitionerError);
        throw new Error(`Échec création praticien: ${practitionerError.message}`);
      }

      console.log('🔔 Préparation des notifications admin pour le nouveau dossier KYC...');

      const { data: adminUsers, error: adminRolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (adminRolesError) {
        console.error('❌ Erreur récupération admins pour notification KYC:', adminRolesError);
      } else if (adminUsers && adminUsers.length > 0) {
        const notificationsPayload = adminUsers.map((admin: { user_id: string }) => ({
          user_id: admin.user_id,
          title: 'Nouveau dossier KYC à valider',
          message: `Le praticien ${practitionerPayload.name} vient de s'inscrire et nécessite une validation KYC.`,
          type: 'kyc_pending',
          link: '/admin?tab=kyc',
        }));

        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notificationsPayload);

        if (notificationError) {
          console.error('❌ Erreur envoi notifications KYC:', notificationError);
        } else {
          console.log(`✅ Notifications KYC envoyées à ${notificationsPayload.length} admin(s)`);
        }
      } else {
        console.log('ℹ️ Aucun admin trouvé pour recevoir la notification KYC');
      }

      console.log('✅ Compte praticien créé avec succès');

      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } catch (error: any) {
      console.error('❌ Erreur transaction, rollback en cours...', error);

      // Rollback: Supprimer le profil si créé
      if (profileCreated) {
        try {
          await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);
          console.log('🔄 Profil supprimé (rollback)');
        } catch (rollbackError) {
          console.error('❌ Erreur rollback profil:', rollbackError);
        }
      }

      // Rollback: Supprimer les documents uploadés
      // Note: Implémenter suppression Wasabi si nécessaire
      if (uploadedDocuments.length > 0) {
        console.log(`🔄 ${uploadedDocuments.length} documents à supprimer (rollback)`);
        // TODO: Appeler edge function pour supprimer de Wasabi
      }

      throw error;
    }

  } catch (error: any) {
    console.error('❌ Erreur globale:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erreur lors de la création du compte praticien',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
