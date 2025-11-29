import { supabase } from "@/integrations/supabase/client";

/**
 * Résultat de la vérification de duplication
 */
export interface DuplicationCheckResult {
  isDuplicate: boolean;
  field: 'phone' | 'email' | null;
  message: string;
}

/**
 * Vérifie si un téléphone existe déjà dans la table profiles (profil patient)
 * Permet le même téléphone dans practitioners (multi-profil)
 *
 * @param phone - Numéro de téléphone à vérifier
 * @param excludeUserId - ID utilisateur à exclure de la vérification (pour les mises à jour)
 * @returns Résultat de la vérification
 */
export async function checkPatientPhoneDuplication(
  phone: string,
  excludeUserId?: string
): Promise<DuplicationCheckResult> {
  try {
    let query = supabase
      .from('profiles')
      .select('id, phone')
      .eq('phone', phone);

    // Exclure l'utilisateur actuel si spécifié (cas de mise à jour de profil)
    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking patient phone duplication:', error);
      return {
        isDuplicate: false,
        field: null,
        message: '',
      };
    }

    if (data) {
      return {
        isDuplicate: true,
        field: 'phone',
        message: 'Ce numéro de téléphone est déjà utilisé par un autre compte patient.',
      };
    }

    return {
      isDuplicate: false,
      field: null,
      message: '',
    };
  } catch (error) {
    console.error('Unexpected error in checkPatientPhoneDuplication:', error);
    return {
      isDuplicate: false,
      field: null,
      message: '',
    };
  }
}

/**
 * Vérifie si un téléphone existe déjà dans la table practitioners (profil praticien)
 * Permet le même téléphone dans profiles (multi-profil)
 *
 * @param phone - Numéro de téléphone à vérifier
 * @param excludeUserId - ID utilisateur à exclure de la vérification (pour les mises à jour)
 * @returns Résultat de la vérification
 */
export async function checkPractitionerPhoneDuplication(
  phone: string,
  excludeUserId?: string
): Promise<DuplicationCheckResult> {
  try {
    let query = supabase
      .from('practitioners')
      .select('user_id, phone')
      .eq('phone', phone);

    // Exclure l'utilisateur actuel si spécifié
    if (excludeUserId) {
      query = query.neq('user_id', excludeUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking practitioner phone duplication:', error);
      return {
        isDuplicate: false,
        field: null,
        message: '',
      };
    }

    if (data) {
      return {
        isDuplicate: true,
        field: 'phone',
        message: 'Ce numéro de téléphone est déjà utilisé par un autre compte praticien.',
      };
    }

    return {
      isDuplicate: false,
      field: null,
      message: '',
    };
  } catch (error) {
    console.error('Unexpected error in checkPractitionerPhoneDuplication:', error);
    return {
      isDuplicate: false,
      field: null,
      message: '',
    };
  }
}

/**
 * Vérifie si un utilisateur a déjà un profil patient
 *
 * @param userId - ID de l'utilisateur à vérifier
 * @returns true si l'utilisateur a déjà un profil patient
 */
export async function hasPatientProfile(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking patient profile:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Unexpected error in hasPatientProfile:', error);
    return false;
  }
}

/**
 * Vérifie si un utilisateur a déjà un profil praticien
 *
 * @param userId - ID de l'utilisateur à vérifier
 * @returns true si l'utilisateur a déjà un profil praticien
 */
export async function hasPractitionerProfile(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('practitioners')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking practitioner profile:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Unexpected error in hasPractitionerProfile:', error);
    return false;
  }
}
