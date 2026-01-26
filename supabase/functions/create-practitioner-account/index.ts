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

// Validation des données avec limites strictes
function validatePractitionerData(practitionerData: any): string[] {
  const errors: string[] = [];

  // Nom - validation stricte
  if (!practitionerData.name || typeof practitionerData.name !== 'string') {
    errors.push('Nom requis');
  } else {
    const name = practitionerData.name.trim();
    if (name.length < 2) {
      errors.push('Nom invalide (minimum 2 caractères)');
    } else if (name.length > 100) {
      errors.push('Nom trop long (maximum 100 caractères)');
    } else if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(name)) {
      errors.push('Nom contient des caractères invalides');
    }
  }

  // Téléphone - validation format international
  if (!practitionerData.phone || typeof practitionerData.phone !== 'string') {
    errors.push('Numéro de téléphone requis');
  } else {
    const cleanPhone = practitionerData.phone.replace(/\s/g, '');
    if (!/^\+?[0-9]{8,15}$/.test(cleanPhone)) {
      errors.push('Numéro de téléphone invalide (format: +229XXXXXXXX)');
    }
  }

  // Vérification du type de praticien
  const isCoachSportif = practitionerData.practitioner_type === 'coach_sportif';
  
  // Spécialité - requise pour tous (y compris les coachs sportifs)
  if (!practitionerData.specialty || typeof practitionerData.specialty !== 'string') {
    errors.push('Spécialité requise');
  } else {
    const specialty = practitionerData.specialty.trim();
    if (specialty.length < 2) {
      errors.push('Spécialité invalide (minimum 2 caractères)');
    } else if (specialty.length > 100) {
      errors.push('Spécialité trop longue (maximum 100 caractères)');
    }
  }

  // Validation spécifique pour coach sportif
  if (isCoachSportif) {
    // Types de séances
    if (!practitionerData.session_types || !Array.isArray(practitionerData.session_types)) {
      errors.push('Types de séances requis pour les coachs sportifs');
    } else if (practitionerData.session_types.length === 0) {
      errors.push('Au moins un type de séance requis pour les coachs sportifs');
    } else if (practitionerData.session_types.length > 10) {
      errors.push('Trop de types de séances sélectionnés (maximum 10)');
    }
    
    // Zone d'intervention
    if (!practitionerData.intervention_zone || typeof practitionerData.intervention_zone !== 'string') {
      errors.push('Zone d\'intervention requise pour les coachs sportifs');
    } else {
      const zone = practitionerData.intervention_zone.trim();
      if (zone.length < 3) {
        errors.push('Zone d\'intervention trop courte (minimum 3 caractères)');
      } else if (zone.length > 200) {
        errors.push('Zone d\'intervention trop longue (maximum 200 caractères)');
      }
    }
    
    // Rayon d'intervention
    if (practitionerData.intervention_radius === undefined || practitionerData.intervention_radius === null) {
      errors.push('Rayon d\'intervention requis pour les coachs sportifs');
    } else {
      const radius = Number(practitionerData.intervention_radius);
      if (isNaN(radius) || radius < 1 || radius > 100) {
        errors.push('Rayon d\'intervention invalide (doit être entre 1 et 100 km)');
      }
    }
  }

  // Années d'expérience
  if (practitionerData.years_experience !== null && practitionerData.years_experience !== undefined) {
    const years = Number(practitionerData.years_experience);
    if (isNaN(years) || years < 0 || years > 70) {
      errors.push('Années d\'expérience invalides (doit être entre 0 et 70)');
    }
  }

  // Adresse - validation si présente
  if (practitionerData.address) {
    if (typeof practitionerData.address !== 'string') {
      errors.push('Adresse invalide');
    } else if (practitionerData.address.length > 200) {
      errors.push('Adresse trop longue (maximum 200 caractères)');
    }
  }

  // Certifications - validation si présentes
  if (practitionerData.certifications && Array.isArray(practitionerData.certifications)) {
    if (practitionerData.certifications.length > 20) {
      errors.push('Trop de certifications (maximum 20)');
    }
  }

  return errors;
}

// ✅ CORRECTION BUG #2: Validation améliorée avec magic bytes
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

  // ✅ Valider les magic bytes pour vérifier l'intégrité
  try {
    const binaryString = atob(base64Content.substring(0, 100)); // Premier 100 bytes suffisent
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Vérifier les magic bytes selon le type MIME
    if (contentType === 'application/pdf') {
      // PDF doit commencer par %PDF-
      const pdfHeader = String.fromCharCode(...bytes.slice(0, 5));
      if (pdfHeader !== '%PDF-') {
        return { valid: false, error: `${documentType}: Fichier PDF corrompu ou invalide` };
      }
    } else if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
      // JPEG doit commencer par FF D8 FF
      if (bytes[0] !== 0xFF || bytes[1] !== 0xD8 || bytes[2] !== 0xFF) {
        return { valid: false, error: `${documentType}: Fichier JPEG corrompu ou invalide` };
      }
    } else if (contentType === 'image/png') {
      // PNG doit commencer par 89 50 4E 47 0D 0A 1A 0A
      const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      for (let i = 0; i < pngMagic.length; i++) {
        if (bytes[i] !== pngMagic[i]) {
          return { valid: false, error: `${documentType}: Fichier PNG corrompu ou invalide` };
        }
      }
    }
  } catch (error) {
    return { valid: false, error: `${documentType}: Impossible de valider le contenu du fichier` };
  }

  return { valid: true };
}

async function uploadDocument(
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

  console.log(`Upload document ${fileName}...`);

  // ✅ FIX: Appel direct via fetch avec le service role key pour éviter les problèmes d'auth
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration');
  }

  const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-to-wasabi`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName,
      fileContent: base64Content,
      contentType,
      folder: "practitioner-documents",
      userId: userId
    })
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('Erreur upload Wasabi:', uploadResponse.status, errorText);
    throw new Error(`Échec upload: ${uploadResponse.status} - ${errorText}`);
  }

  const data = await uploadResponse.json();

  if (!data || !data.success) {
    throw new Error(data?.error || 'Échec upload Wasabi');
  }

  return {
    path: data.filePath,
    url: data.url,
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
    console.log('📋 Données reçues:', {
      userId,
      profileDataKeys: profileData ? Object.keys(profileData) : [],
      practitionerDataKeys: practitionerData ? Object.keys(practitionerData) : [],
      documentsKeys: documents ? Object.keys(documents) : [],
      practitionerType: practitionerData?.practitioner_type,
      phone: practitionerData?.phone ? '***' + practitionerData.phone.slice(-4) : 'N/A'
    });

    // ✅ SÉCURITÉ: Vérifier que le userId correspond à un utilisateur existant dans auth.users
    if (!userId || typeof userId !== 'string' || userId.length < 20) {
      console.error('❌ userId invalide:', userId);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Identifiant utilisateur invalide',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Vérifier que l'utilisateur existe dans auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authUser?.user) {
      console.error('❌ Utilisateur non trouvé dans auth.users:', authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Utilisateur non trouvé. Veuillez vous réinscrire.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // Vérifier que l'utilisateur a été créé récemment (moins de 60 minutes)
    // Note: 60 minutes permet les connexions lentes, les gros uploads de documents et les retries
    const createdAt = new Date(authUser.user.created_at);
    const now = new Date();
    const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);

    if (minutesSinceCreation > 60) {
      console.error('❌ Compte créé il y a plus de 60 minutes, possible tentative de fraude');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Session expirée. Veuillez vous réinscrire.',
          details: [`Le compte a été créé il y a ${Math.floor(minutesSinceCreation)} minutes. Maximum autorisé: 60 minutes.`]
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }
    
    // ✅ Vérifier si un praticien existe déjà pour cet utilisateur
    const { data: existingPractitionerForUser, error: existingCheckError } = await supabase
      .from('practitioners')
      .select('id, kyc_status')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (existingPractitionerForUser) {
      console.log('ℹ️ Praticien déjà existant pour cet utilisateur:', existingPractitionerForUser.id);
      return new Response(
        JSON.stringify({
          success: true,
          practitionerId: existingPractitionerForUser.id,
          message: 'Compte praticien déjà existant'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log('✅ Utilisateur validé:', authUser.user.email);

    // ✅ CONTRÔLE D'UNICITÉ: Vérifier si un praticien existe déjà avec ce téléphone
    const { data: existingPractitioner, error: checkError } = await supabase
      .from('practitioners')
      .select('user_id, phone')
      .eq('phone', practitionerData.phone)
      .neq('user_id', userId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Erreur vérification unicité téléphone:', checkError);
    }

    if (existingPractitioner) {
      console.error('❌ Numéro téléphone déjà utilisé par un autre praticien');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ce numéro de téléphone est déjà utilisé par un autre praticien',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409, // Conflict
        }
      );
    }

    // ✅ CONTRÔLE D'UNICITÉ EMAIL: Vérifier si un praticien existe déjà avec cet email
    const { data: currentUser } = await supabase.auth.admin.getUserById(userId);
    
    if (currentUser?.user?.email) {
      // Chercher d'autres utilisateurs avec le même email
      const { data: allUsers } = await supabase.auth.admin.listUsers();
      const otherUsersWithEmail = allUsers?.users?.filter(
        (u: any) => u.email === currentUser.user.email && u.id !== userId
      ) || [];

      if (otherUsersWithEmail.length > 0) {
        // Vérifier si ces utilisateurs sont des praticiens
        const otherUserIds = otherUsersWithEmail.map((u: any) => u.id);
        const { data: existingPractitioners } = await supabase
          .from('practitioners')
          .select('user_id')
          .in('user_id', otherUserIds);
        
        // Si au moins un est praticien, c'est un doublon
        if (existingPractitioners && existingPractitioners.length > 0) {
          console.error('❌ Email déjà utilisé par un autre praticien');
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Cette adresse email est déjà utilisée par un autre praticien',
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 409,
            }
          );
        }
      }
    }

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

    // Validation des documents obligatoires selon le type de praticien
    const isCoachSportif = practitionerData.practitioner_type === 'coach_sportif';
    
    // Vérifier documents obligatoires
    if (!documents.idDocument) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Pièce d\'identité requise',
          details: ["Le document d'identité est obligatoire pour tous les praticiens"]
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }
    
    if (isCoachSportif && !documents.diploma) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Diplôme requis',
          details: ["Un diplôme ou certificat est obligatoire pour les coachs sportifs"]
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }
    
    if (!isCoachSportif && !documents.licenseDocument) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Autorisation d\'exercice requise',
          details: ["L'autorisation d'exercice est obligatoire pour les praticiens de santé"]
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
      // 1. Vérifier si le profil existe déjà pour ce userId
      console.log('📝 Vérification profil existant...');
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id, phone')
        .eq('id', userId)
        .maybeSingle();
      
      if (profileCheckError) {
        console.error('❌ Erreur vérification profil:', profileCheckError);
      }

      // Si le profil existe déjà et que le téléphone est différent, vérifier que le nouveau téléphone est disponible
      if (existingProfile && existingProfile.phone !== profileData.phone) {
        const { data: phoneConflict } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', profileData.phone)
          .neq('id', userId)
          .maybeSingle();
        
        if (phoneConflict) {
          console.error('❌ Téléphone déjà utilisé par un autre profil');
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Ce numéro de téléphone est déjà associé à un autre compte. Utilisez un autre numéro ou connectez-vous avec le compte existant.',
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 409,
            }
          );
        }
      }

      // Vérifier aussi si le téléphone existe pour un autre utilisateur (nouveau profil)
      if (!existingProfile) {
        const { data: phoneConflict } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', profileData.phone)
          .maybeSingle();
        
        if (phoneConflict) {
          console.error('❌ Téléphone déjà utilisé par un autre profil:', phoneConflict.id);
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Ce numéro de téléphone est déjà associé à un autre compte. Si vous avez déjà un compte patient, connectez-vous avec celui-ci puis contactez le support pour migrer vers un compte praticien.',
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 409,
            }
          );
        }
      }

      // Créer ou mettre à jour le profil
      console.log('📝 Création/mise à jour profil...');
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert([profileData], { onConflict: 'id' });

      if (profileError) {
        console.error('❌ Erreur profil:', profileError);
        
        // Détecter les erreurs spécifiques pour des messages clairs
        let errorMessage = profileError.message;
        if (profileError.message.includes('Phone number') && profileError.message.includes('already exists')) {
          errorMessage = 'Ce numéro de téléphone est déjà utilisé par un autre utilisateur. Utilisez un autre numéro.';
        } else if (profileError.code === 'P0001') {
          errorMessage = profileError.message;
        }
        
        throw new Error(`Échec création profil: ${errorMessage}`);
      }
      profileCreated = true;
      console.log('✅ Profil créé/mis à jour');

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
            const result = await uploadDocument(base64Data, fileName, userId);
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
        image: uploadedDocs.profilePhoto?.path || null, // ✅ CORRECTION: Utiliser path au lieu de url pour cohérence
        id_document_url: uploadedDocs.idDocument?.path || null,
        license_document_url: uploadedDocs.licenseDocument?.path || null,
        insurance_document_url: uploadedDocs.diploma?.path || null, // Pour coach: diplôme/certification
        kyc_status: 'pending',
        can_accept_missions: false,
      };
      
      console.log('✅ Documents uploadés:', {
        profilePhoto: !!uploadedDocs.profilePhoto,
        idDocument: !!uploadedDocs.idDocument,
        licenseDocument: !!uploadedDocs.licenseDocument,
        diploma: !!uploadedDocs.diploma,
      });

      const { data: practitionerResult, error: practitionerError } = await supabase
        .from('practitioners')
        .insert([practitionerPayload])
        .select()
        .single();

      if (practitionerError) {
        console.error('❌ Erreur praticien:', practitionerError);
        console.error('❌ Détails payload:', JSON.stringify(practitionerPayload, null, 2));
        
        // Messages d'erreur plus explicites
        let errorMessage = practitionerError.message;
        if (practitionerError.code === '23505') {
          errorMessage = 'Un praticien existe déjà avec ces informations (téléphone ou email)';
        } else if (practitionerError.code === '23502') {
          errorMessage = `Champ obligatoire manquant: ${practitionerError.message}`;
        } else if (practitionerError.code === '42501') {
          errorMessage = 'Erreur de permissions. Contactez le support.';
        }
        
        throw new Error(`Échec création praticien: ${errorMessage}`);
      }

      practitionerCreated = true;
      const practitionerId = practitionerResult?.id;
      console.log('✅ Praticien créé avec ID:', practitionerId);
      
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
        JSON.stringify({ 
          success: true,
          practitionerId: practitionerId 
        }),
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
