import { supabase } from "@/integrations/supabase/client";

/**
 * IMPORTANT : Distinction entre rôles applicatifs et rôles de base de données
 *
 * AppRole : Rôles utilisés dans l'application (patient, practitioner, coach, admin, incomplete_practitioner)
 * Ces rôles sont déterminés dynamiquement et ne sont PAS tous stockés en base.
 *
 * Table user_roles (DB) : Contient UNIQUEMENT les rôles administrateurs
 * (super_admin, ops, finance, compliance, support, analyst)
 *
 * Résolution des rôles applicatifs :
 * - admin : Vérifié via table user_roles (n'importe quel rôle admin)
 * - practitioner/coach : Déterminé via table practitioners (colonne practitioner_type)
 * - incomplete_practitioner : user_metadata indique practitioner mais pas d'enregistrement practitioners
 * - patient : Rôle par défaut si l'utilisateur n'est ni admin ni practitioner
 *
 * Les valeurs 'patient', 'practitioner', 'coach' de l'enum app_role en base
 * ne sont JAMAIS insérées dans user_roles - elles existent uniquement pour
 * permettre l'utilisation de l'enum dans d'autres contextes si nécessaire.
 */
export type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin' | 'incomplete_practitioner';

export interface UserRoleResult {
  role: AppRole;
  source: string;
  practitionerType?: string; // Type de praticien si applicable (pour incomplete_practitioner)
}

/**
 * Résout le rôle d'un utilisateur en vérifiant plusieurs sources dans l'ordre de priorité
 * @param userId - L'ID de l'utilisateur
 * @returns Le rôle de l'utilisateur et la source de cette information
 */
export async function resolveUserRole(userId: string): Promise<UserRoleResult> {
  try {
    // PRIORITÉ 1: Vérifier si l'utilisateur est un admin via la table user_roles
    // SEULS les rôles administrateurs sont stockés dans user_roles
    // (super_admin, ops, finance, compliance, support, analyst)
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
    // Les rôles 'practitioner' et 'coach' NE SONT JAMAIS dans user_roles
    // Ils sont déterminés par la colonne practitioner_type de la table practitioners
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

    // PRIORITÉ 3: Vérifier les métadonnées utilisateur
    // Si user_metadata indique practitioner mais pas d'enregistrement practitioners,
    // c'est une inscription incomplète
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (!userError && user?.id === userId && user.user_metadata?.user_type) {
      const metadataType = user.user_metadata.user_type;
      const practitionerType = user.user_metadata.practitioner_type;

      // L'utilisateur s'est inscrit comme praticien mais l'enregistrement n'a pas été créé
      // C'est une inscription incomplète qui nécessite une récupération
      if (metadataType === 'practitioner') {
        console.warn(`[UserRoleResolver] Inscription praticien incomplète détectée pour ${userId}`);
        return {
          role: 'incomplete_practitioner',
          source: 'user_metadata_incomplete',
          practitionerType: practitionerType || 'unknown'
        };
      }

      // Pour coach_sportif spécifiquement dans les métadonnées
      if (metadataType === 'coach_sportif' || practitionerType === 'coach_sportif') {
        console.warn(`[UserRoleResolver] Inscription coach incomplète détectée pour ${userId}`);
        return {
          role: 'incomplete_practitioner',
          source: 'user_metadata_incomplete',
          practitionerType: 'coach_sportif'
        };
      }
    }

    // PRIORITÉ 4: Par défaut, c'est un patient
    // Le rôle 'patient' n'est JAMAIS stocké en base - c'est le rôle par défaut
    // pour tous les utilisateurs qui ne sont ni admins ni practitioners
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
 * @param practitionerType - Type de praticien pour incomplete_practitioner
 * @returns Le chemin du dashboard correspondant au rôle
 */
export function getDashboardPathForRole(role: AppRole, practitionerType?: string): string {
  // Cas spécial: inscription incomplète → page de récupération
  if (role === 'incomplete_practitioner') {
    return '/complete-registration';
  }

  const dashboardPaths: Record<Exclude<AppRole, 'incomplete_practitioner'>, string> = {
    admin: '/admin',
    practitioner: '/dashboard/practitioner',
    coach: '/dashboard/coach',
    patient: '/dashboard/patient'
  };

  return dashboardPaths[role as Exclude<AppRole, 'incomplete_practitioner'>];
}

/**
 * Résout le rôle d'un utilisateur et retourne directement le chemin du dashboard
 * @param userId - L'ID de l'utilisateur
 * @returns Le chemin du dashboard approprié
 */
export async function getDashboardPathForUser(userId: string): Promise<string> {
  const { role, practitionerType } = await resolveUserRole(userId);
  return getDashboardPathForRole(role, practitionerType);
}

/**
 * Résout le rôle de l'utilisateur authentifié et retourne directement le chemin du dashboard
 * @returns Le chemin du dashboard approprié pour l'utilisateur authentifié
 */
export async function getDashboardPathFromAuth(): Promise<string> {
  const { role, practitionerType } = await resolveUserRoleFromAuth();
  return getDashboardPathForRole(role, practitionerType);
}

/**
 * Vérifie si un rôle indique une inscription incomplète
 * @param role - Le rôle à vérifier
 * @returns true si l'inscription est incomplète
 */
export function isIncompleteRegistration(role: AppRole): boolean {
  return role === 'incomplete_practitioner';
}
