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

// Validation des données
function validatePractitionerData(practitionerData: any): string[] {
  const errors: string[] = [];

  if (!practitionerData.name || practitionerData.name.trim().length < 2) {
    errors.push('Nom invalide (minimum 2 caractères)');
  }

  if (!practitionerData.phone || !/^\+?[0-9]{8,15}$/.test(practitionerData.phone.replace(/\s/g, ''))) {
    errors.push('Numéro de téléphone invalide');
  }

  // La spécialité n'est pas requise pour les coachs sportifs
  const isCoachSportif = practitionerData.practitioner_type === 'coach_sportif';
  if (!isCoachSportif && (!practitionerData.specialty || practitionerData.specialty.trim().length < 2)) {
    errors.push('Spécialité requise');
  }

  if (practitionerData.years_experience !== null && (practitionerData.years_experience < 0 || practitionerData.years_experience > 70)) {
    errors.push('Années d\'expérience invalides (0-70)');
  }

  if (practitionerData.intervention_radius && (practitionerData.intervention_radius < 1 || practitionerData.intervention_radius > 100)) {
    errors.push('Rayon d\'intervention invalide (1-100 km)');
  }

  return errors;
}

function validateDocument(base64Data: string, documentType: string): { valid: boolean; error?: string } {
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return { valid: false, error: `${documentType}: Format base64 invalide` };
  }

  const contentType = matches[1];
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  
  if (!allowedTypes.includes(contentType)) {
    return { valid: false, error: `${documentType}: Type non supporté (PDF, JPG, PNG uniquement)` };
  }

  const base64Content = matches[2];
  const sizeInBytes = (base64Content.length * 3) / 4;
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  if (sizeInBytes > MAX_SIZE) {
    return { valid: false, error: `${documentType}: Fichier trop volumineux (max 5MB)` };
  }

  return { valid: true };
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

async function deleteWasabiDocument(supabase: any, filePath: string): Promise<void> {
  try {
    // Appeler l'edge function pour supprimer de Wasabi
    // NOTE: Nécessite une fonction dédiée ou extension de upload-to-wasabi
    console.log(`🗑️ Suppression document Wasabi: ${filePath}`);
    // TODO: Implémenter fonction de suppression Wasabi quand disponible
  } catch (error) {
    console.error(`❌ Erreur suppression Wasabi ${filePath}:`, error);
  }
}

async function sendKYCNotifications(supabase: any, practitionerName: string): Promise<void> {
  const ADMIN_ROLES = ['super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst'];

  const { data: adminUsers, error: adminRolesError } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', ADMIN_ROLES);

  if (adminRolesError) {
    throw new Error(`Erreur récupération admins: ${adminRolesError.message}`);
  }

  if (adminUsers && adminUsers.length > 0) {
    const uniqueAdminIds = Array.from(new Set(adminUsers.map((admin: { user_id: string }) => admin.user_id)));

    const notificationsPayload = uniqueAdminIds.map((adminId) => ({
      user_id: adminId,
      title: 'Nouveau dossier KYC à valider',
      message: `Le praticien ${practitionerName} vient de s'inscrire et nécessite une validation KYC.`,
      type: 'kyc_pending',
      link: '/admin?tab=kyc',
    }));

    const { error: notificationError } = await supabase
      .from('notifications')
      .insert(notificationsPayload);

    if (notificationError) {
      throw new Error(`Erreur envoi notifications: ${notificationError.message}`);
    }
    
    console.log(`✅ Notifications KYC envoyées à ${notificationsPayload.length} admin(s)`);
  } else {
    console.log('ℹ️ Aucun admin trouvé pour recevoir la notification KYC');
  }
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

    console.log('🚀 Création compte praticien atomique:', userId);

    // Validation stricte des données praticien
    const validationErrors = validatePractitionerData(practitionerData);
    if (validationErrors.length > 0) {
      console.error('❌ Erreurs validation:', validationErrors);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Données invalides',
          details: validationErrors,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Validation des documents
    for (const [key, base64Data] of Object.entries(documents)) {
      if (base64Data) {
        const validation = validateDocument(base64Data, key);
        if (!validation.valid) {
          console.error('❌ Document invalide:', validation.error);
          return new Response(
            JSON.stringify({
              success: false,
              error: validation.error,
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
            }
          );
        }
      }
    }

    // Variables pour rollback
    let profileCreated = false;
    let practitionerCreated = false;
    let uploadedDocuments: Array<{ key: string; path: string }> = [];

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

      console.log('📤 Upload documents...');
      const uploadedDocs: Record<string, any> = {};
      
      for (const [key, base64Data] of Object.entries(documents)) {
        if (base64Data) {
          try {
            // Détecter l'extension à partir du content-type
            const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,/);
            const contentType = matches ? matches[1] : 'application/octet-stream';
            
            let ext = 'jpg'; // Par défaut
            if (contentType.includes('pdf')) {
              ext = 'pdf';
            } else if (contentType.includes('png')) {
              ext = 'png';
            } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              ext = 'jpg';
            }
            
            const fileName = `${key}_${Date.now()}.${ext}`;
            const result = await uploadDocument(supabase, base64Data, fileName, userId);
            uploadedDocs[key] = result;
            uploadedDocuments.push({ key, path: result.path });
            console.log(`✅ ${key} uploadé: ${result.path}`);
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
        insurance_document_url: uploadedDocs.diploma?.path || null,
        kyc_status: 'pending',
        can_accept_missions: false,
      };

      const { data: practitionerResult, error: practitionerError } = await supabase
        .from('practitioners')
        .insert([practitionerPayload])
        .select()
        .single();

      if (practitionerError) {
        console.error('❌ Erreur praticien:', practitionerError);
        throw new Error(`Échec création praticien: ${practitionerError.message}`);
      }

      practitionerCreated = true;
      
      // Envoyer les notifications KYC aux admins
      console.log('🔔 Envoi notifications KYC aux admins...');
      try {
        await sendKYCNotifications(supabase, practitionerPayload.name);
        console.log('✅ Notifications KYC envoyées');
      } catch (notifError: any) {
        console.error('❌ Erreur notifications KYC (non bloquant):', notifError);
        // Non bloquant, on continue
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
