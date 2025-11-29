import { supabase } from "@/integrations/supabase/client";

export type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin';

const COACH_TYPE = "coach_sportif";

/**
 * Interface pour le résultat de résolution du rôle
 */
export interface UserRoleResult {
  role: AppRole;
  source: 'user_roles' | 'practitioners' | 'user_metadata' | 'default';
}

/**
 * Fonction centrale pour résoudre le rôle d'un utilisateur
 * Cette fonction établit un ordre de priorité clair :
 *
 * PRIORITÉ 1: Table user_roles (pour les admins)
 * PRIORITÉ 2: Table practitioners (pour practitioners et coaches)
 * PRIORITÉ 3: User metadata (fallback pour les anciennes données)
 * PRIORITÉ 4: Par défaut = patient
 *
 * @param userId - L'ID de l'utilisateur à vérifier
 * @returns Le rôle de l'utilisateur et sa source
 */
export async function resolveUserRole(userId: string): Promise<UserRoleResult> {
  try {
    // PRIORITÉ 1: Vérifier d'abord si c'est un admin
    const { data: adminRole, error: adminError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (adminError && adminError.code !== 'PGRST116') {
      console.error('Error checking admin role:', adminError);
    }

    if (adminRole?.role) {
      return { role: 'admin', source: 'user_roles' };
    }

    // PRIORITÉ 2: Vérifier la table practitioners
    const { data: practitionerData, error: practitionerError } = await supabase
      .from('practitioners')
      .select('practitioner_type')
      .eq('user_id', userId)
      .maybeSingle();

    if (practitionerError && practitionerError.code !== 'PGRST116') {
      console.error('Error checking practitioner role:', practitionerError);
    }

    if (practitionerData) {
      if (practitionerData.practitioner_type === COACH_TYPE) {
        return { role: 'coach', source: 'practitioners' };
      } else {
        return { role: 'practitioner', source: 'practitioners' };
      }
    }

    // PRIORITÉ 3: Fallback sur les métadonnées utilisateur (pour compatibilité)
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (!userError && userData?.user?.user_metadata) {
      const metadata = userData.user.user_metadata;

      if (metadata.user_type === 'practitioner') {
        if (metadata.practitioner_type === COACH_TYPE) {
          return { role: 'coach', source: 'user_metadata' };
        }
        return { role: 'practitioner', source: 'user_metadata' };
      }

      if (metadata.user_type === 'patient') {
        return { role: 'patient', source: 'user_metadata' };
      }
    }

    // PRIORITÉ 4: Par défaut, considérer comme patient
    return { role: 'patient', source: 'default' };
  } catch (error) {
    console.error('Unexpected error resolving user role:', error);
    return { role: 'patient', source: 'default' };
  }
}

/**
 * Résout le rôle à partir de la session authentifiée actuelle
 * @returns Le rôle de l'utilisateur et sa source
 */
export async function resolveUserRoleFromAuth(): Promise<UserRoleResult> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    console.error('Unable to resolve authenticated user:', error);
    return { role: 'patient', source: 'default' };
  }

  return resolveUserRole(data.user.id);
}

/**
 * Obtient le chemin du dashboard approprié pour un rôle
 * @param role - Le rôle de l'utilisateur
 * @returns Le chemin du dashboard
 */
export function getDashboardPathForRole(role: AppRole): string {
  const paths: Record<AppRole, string> = {
    admin: '/admin',
    practitioner: '/dashboard/practitioner',
    coach: '/dashboard/coach',
    patient: '/dashboard/patient',
  };

  return paths[role];
}
