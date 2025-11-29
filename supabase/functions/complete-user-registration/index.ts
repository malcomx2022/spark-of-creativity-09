import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { getSecureCorsHeaders } from '../_shared/csrf.ts';

interface PatientRegistrationData {
  userType: 'patient';
  profile: {
    fullName: string;
    phone: string;
    gender: string;
    dateOfBirth: string;
  };
  address?: {
    label: string;
    address: string;
  };
  emergencyContact?: {
    name: string;
    phone: string;
    relationship?: string;
  };
  medicalHistory?: string[];
  acceptTermsAt: string;
}

interface PractitionerRegistrationData {
  userType: 'practitioner';
  // Les données du praticien seront gérées par create-practitioner-account
  email: string;
  fullName: string;
  phone: string;
}

type RegistrationData = PatientRegistrationData | PractitionerRegistrationData;

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getSecureCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, data }: { userId: string; data: RegistrationData } = await req.json();

    console.log('[complete-user-registration] Starting registration for user:', userId, 'type:', data.userType);

    if (data.userType === 'patient') {
      // Traiter l'inscription patient
      await processPatientRegistration(supabase, userId, data);
    } else if (data.userType === 'practitioner') {
      // Pour les praticiens, on ne fait que déclencher la notification
      // La création du profil est déjà faite par create-practitioner-account
      await sendRegistrationNotification(data.email, data.phone, data.fullName, 'practitioner');
    }

    console.log('[complete-user-registration] Registration completed successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'Inscription finalisée avec succès' }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('[complete-user-registration] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erreur lors de la finalisation de l\'inscription'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function processPatientRegistration(
  supabase: any,
  userId: string,
  data: PatientRegistrationData
) {
  console.log('[processPatientRegistration] Creating profile for user:', userId);

  // ✅ VALIDATION BACKEND
  // Validation téléphone
  if (!data.profile.phone || !/^\+229\d{8}$/.test(data.profile.phone)) {
    throw new Error('Numéro de téléphone invalide (format requis: +229XXXXXXXX)');
  }

  // Validation nom complet
  if (!data.profile.fullName || data.profile.fullName.trim().length < 3) {
    throw new Error('Nom complet trop court (minimum 3 caractères)');
  }

  // Validation date de naissance
  if (data.profile.dateOfBirth) {
    const birthDate = new Date(data.profile.dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    if (age < 0 || age > 120 || birthDate > today) {
      throw new Error('Date de naissance invalide');
    }
  }

  // Validation genre
  const validGenders = ['homme', 'femme', 'autre', 'non_specifie'];
  if (data.profile.gender && !validGenders.includes(data.profile.gender)) {
    throw new Error('Genre invalide');
  }

  // Validation contact d'urgence
  if (data.emergencyContact) {
    if (!data.emergencyContact.phone || !/^\+229\d{8}$/.test(data.emergencyContact.phone)) {
      throw new Error('Numéro de contact d\'urgence invalide');
    }
    if (!data.emergencyContact.name || data.emergencyContact.name.trim().length < 2) {
      throw new Error('Nom du contact d\'urgence invalide');
    }
  }

  // Validation adresse
  if (data.address && (!data.address.address || data.address.address.trim().length < 10)) {
    throw new Error('Adresse trop courte (minimum 10 caractères)');
  }

  // ✅ Vérification unicité du téléphone
  const { data: existingPhone, error: phoneCheckError } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', data.profile.phone)
    .maybeSingle();

  if (phoneCheckError && phoneCheckError.code !== 'PGRST116') {
    throw phoneCheckError;
  }

  if (existingPhone) {
    throw new Error('Ce numéro de téléphone est déjà utilisé');
  }

  // 1. Créer/Mettre à jour le profil
  const genderMap: Record<string, 'homme' | 'femme' | 'autre' | 'non_specifie'> = {
    'homme': 'homme',
    'femme': 'femme',
    'autre': 'autre',
    'non_specifie': 'non_specifie',
  };
  
  const normalizedGender = data.profile.gender ? 
    (genderMap[data.profile.gender] || 'non_specifie') : 'non_specifie';

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name: data.profile.fullName,
      phone: data.profile.phone,
      gender: normalizedGender,
      date_of_birth: data.profile.dateOfBirth || null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    });

  if (profileError) {
    console.error('[processPatientRegistration] Profile error:', profileError);
    throw new Error(`Erreur lors de la création du profil: ${profileError.message}`);
  }

  // 2. Créer l'adresse si fournie
  if (data.address && data.address.address.trim()) {
    console.log('[processPatientRegistration] Creating address');
    
    const { error: addressError } = await supabase
      .from('addresses')
      .insert({
        user_id: userId,
        label: data.address.label,
        address: data.address.address,
        is_default: true,
      });

    if (addressError && addressError.code !== '23505') { // Ignore duplicate errors
      console.error('[processPatientRegistration] Address error:', addressError);
      throw new Error(`Erreur lors de la création de l'adresse: ${addressError.message}`);
    }
  }

  // 3. Créer le contact d'urgence si fourni
  if (data.emergencyContact && data.emergencyContact.name.trim() && data.emergencyContact.phone.trim()) {
    console.log('[processPatientRegistration] Creating emergency contact');
    
    const { error: contactError } = await supabase
      .from('emergency_contacts')
      .insert({
        user_id: userId,
        name: data.emergencyContact.name,
        phone: data.emergencyContact.phone,
        relationship: data.emergencyContact.relationship || "Contact d'urgence",
      });

    if (contactError && contactError.code !== '23505') {
      console.error('[processPatientRegistration] Emergency contact error:', contactError);
      throw new Error(`Erreur lors de la création du contact d'urgence: ${contactError.message}`);
    }
  }

  // 4. Créer le profil médical
  console.log('[processPatientRegistration] Creating medical profile');
  
  const chronicDiseases = (data.medicalHistory || []).join(', ') || null;

  const { error: medicalError } = await supabase
    .from('medical_profiles')
    .insert({
      user_id: userId,
      chronic_diseases: chronicDiseases,
      share_with_practitioner: true,
    });

  if (medicalError && medicalError.code !== '23505') {
    console.error('[processPatientRegistration] Medical profile error:', medicalError);
    throw new Error(`Erreur lors de la création du profil médical: ${medicalError.message}`);
  }

  // 5. Enregistrer le consentement
  console.log('[processPatientRegistration] Recording consent');
  
  const { error: consentError } = await supabase
    .from('consents')
    .insert({
      user_id: userId,
      consent_type: 'cgu',
      is_accepted: true,
      accepted_at: data.acceptTermsAt,
    });

  if (consentError && consentError.code !== '23505') {
    console.error('[processPatientRegistration] Consent error:', consentError);
    // Non bloquant, on continue
  }

  // 6. Envoyer la notification
  console.log('[processPatientRegistration] Sending notification');
  
  // Récupérer l'email de l'utilisateur
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  
  if (userError || !userData.user?.email) {
    console.error('[processPatientRegistration] Could not retrieve user email:', userError);
  } else {
    await sendRegistrationNotification(
      userData.user.email,
      data.profile.phone,
      data.profile.fullName,
      'patient'
    );
  }
}

async function sendRegistrationNotification(
  email: string,
  phone: string,
  fullName: string,
  userType: 'patient' | 'practitioner'
) {
  try {
    console.log('[sendRegistrationNotification] Sending notification to:', email);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-registration-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        email,
        phone,
        fullName,
        userType,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[sendRegistrationNotification] Notification error:', error);
      // Non bloquant, on log juste l'erreur
    } else {
      console.log('[sendRegistrationNotification] Notification sent successfully');
    }
  } catch (error: any) {
    console.error('[sendRegistrationNotification] Exception:', error);
    // Non bloquant
  }
}
