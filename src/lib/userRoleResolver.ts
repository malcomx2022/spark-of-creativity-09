import { supabase } from "@/integrations/supabase/client";

export type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin';

export interface UserRoleResult {
  role: AppRole;
  source: string;
}

/**
 * Résout le rôle d'un utilisateur en vérifiant plusieurs sources dans l'ordre de priorité
 * @param userId - L'ID de l'utilisateur
 * @returns Le rôle de l'utilisateur et la source de cette information
 */
export async function resolveUserRole(userId: string): Promise<UserRoleResult> {
  try {
    // PRIORITÉ 1: Vérifier si l'utilisateur est un admin via la table user_roles
    const { data: adminRole, error: adminError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (!adminError && adminRole?.role) {
      return {
        role: 'admin',
        source: 'user_roles'
      };
    }

    // PRIORITÉ 2: Vérifier si c'est un praticien ou coach via la table practitioners
    const { data: practitioner, error: practitionerError } = await supabase
      .from("practitioners")
      .select("practitioner_type")
      .eq("user_id", userId)
      .maybeSingle();

    if (!practitionerError && practitioner) {
      // Distinction entre coach sportif et praticien classique
      if (practitioner.practitioner_type === 'coach_sportif') {
        return {
          role: 'coach',
          source: 'practitioners'
        };
      }
      return {
        role: 'practitioner',
        source: 'practitioners'
      };
    }

    // PRIORITÉ 3: Vérifier les métadonnées utilisateur (fallback pour compatibilité)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (!userError && user?.id === userId && user.user_metadata?.user_type) {
      const metadataType = user.user_metadata.user_type;
      
      if (metadataType === 'coach_sportif') {
        return {
          role: 'coach',
          source: 'user_metadata'
        };
      }
      
      if (metadataType === 'practitioner') {
        return {
          role: 'practitioner',
          source: 'user_metadata'
        };
      }
    }

    // PRIORITÉ 4: Par défaut, c'est un patient
    return {
      role: 'patient',
      source: 'default'
    };

  } catch (error) {
    console.error("Error resolving user role:", error);
    // En cas d'erreur, retourner patient par défaut
    return {
      role: 'patient',
      source: 'error_fallback'
    };
  }
}

/**
 * Résout le rôle de l'utilisateur authentifié actuel
 * @returns Le rôle de l'utilisateur authentifié et la source de cette information
 */
export async function resolveUserRoleFromAuth(): Promise<UserRoleResult> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      console.error("Unable to resolve authenticated user:", error);
      return {
        role: 'patient',
        source: 'no_auth'
      };
    }

    return await resolveUserRole(user.id);
  } catch (error) {
    console.error("Error in resolveUserRoleFromAuth:", error);
    return {
      role: 'patient',
      source: 'error_fallback'
    };
  }
}

/**
 * Obtient le chemin du dashboard approprié pour un rôle donné
 * @param role - Le rôle de l'utilisateur
 * @returns Le chemin du dashboard correspondant au rôle
 */
export function getDashboardPathForRole(role: AppRole): string {
  const dashboardPaths: Record<AppRole, string> = {
    admin: '/admin',
    practitioner: '/dashboard/practitioner',
    coach: '/dashboard/coach',
    patient: '/dashboard/patient'
  };

  return dashboardPaths[role];
}

/**
 * Résout le rôle d'un utilisateur et retourne directement le chemin du dashboard
 * @param userId - L'ID de l'utilisateur
 * @returns Le chemin du dashboard approprié
 */
export async function getDashboardPathForUser(userId: string): Promise<string> {
  const { role } = await resolveUserRole(userId);
  return getDashboardPathForRole(role);
}

/**
 * Résout le rôle de l'utilisateur authentifié et retourne directement le chemin du dashboard
 * @returns Le chemin du dashboard approprié pour l'utilisateur authentifié
 */
export async function getDashboardPathFromAuth(): Promise<string> {
  const { role } = await resolveUserRoleFromAuth();
  return getDashboardPathForRole(role);
}
