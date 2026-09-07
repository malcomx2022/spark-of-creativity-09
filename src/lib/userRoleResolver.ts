import { auth, type AppRole } from '@/lib/api';

export type { AppRole };

/**
 * IMPORTANT : Distinction entre rôles applicatifs et rôles de base de données
 *
 * AppRole : Rôles utilisés dans l'application (patient, practitioner, coach, admin, incomplete_practitioner)
 * Ces rôles sont déterminés dynamiquement et ne sont PAS tous stockés en base.
 *
 * Table user_roles (DB) : Contient UNIQUEMENT les rôles administrateurs
 * (super_admin, ops, finance, compliance, support, analyst)
 *
 * La résolution (admin via user_roles → practitioner/coach via practitioners →
 * incomplete_practitioner via les métadonnées → patient par défaut) est faite côté serveur
 * par `GET /api/auth/me` (RoleResolverService), avec exactement les mêmes priorités que
 * l'ancienne implémentation cliente.
 */
export interface UserRoleResult {
  role: AppRole;
  source: string;
  practitionerType?: string; // Type de praticien si applicable (pour incomplete_practitioner)
}

/**
 * Résout le rôle de l'utilisateur connecté.
 * @param userId - L'ID attendu ; si la session appartient à un autre utilisateur, retourne patient
 */
export async function resolveUserRole(userId: string): Promise<UserRoleResult> {
  try {
    const me = await auth.me();
    if (!me || me.user.id !== userId) return { role: 'patient', source: 'no_auth' };
    if (me.role === 'incomplete_practitioner') console.warn(`[UserRoleResolver] Inscription praticien incomplète détectée pour ${userId}`);
    return { role: me.role, source: me.source, practitionerType: me.practitionerType };
  } catch (error) {
    console.error('Error resolving user role:', error);
    // En cas d'erreur, retourner patient par défaut
    return { role: 'patient', source: 'error_fallback' };
  }
}

/**
 * Résout le rôle de l'utilisateur authentifié actuel
 */
export async function resolveUserRoleFromAuth(): Promise<UserRoleResult> {
  const user = auth.getUser();
  if (!user) return { role: 'patient', source: 'no_auth' };
  return resolveUserRole(user.id);
}

/**
 * Obtient le chemin du dashboard approprié pour un rôle donné
 */
export function getDashboardPathForRole(role: AppRole, practitionerType?: string): string {
  void practitionerType;
  // Cas spécial: inscription incomplète → page de récupération
  if (role === 'incomplete_practitioner') {
    return '/complete-registration';
  }

  const dashboardPaths: Record<Exclude<AppRole, 'incomplete_practitioner'>, string> = {
    admin: '/admin',
    practitioner: '/dashboard/practitioner',
    coach: '/dashboard/coach',
    patient: '/dashboard/patient',
  };

  return dashboardPaths[role as Exclude<AppRole, 'incomplete_practitioner'>];
}

export async function getDashboardPathForUser(userId: string): Promise<string> {
  const { role, practitionerType } = await resolveUserRole(userId);
  return getDashboardPathForRole(role, practitionerType);
}

export async function getDashboardPathFromAuth(): Promise<string> {
  const { role, practitionerType } = await resolveUserRoleFromAuth();
  return getDashboardPathForRole(role, practitionerType);
}

/**
 * Vérifie si un rôle indique une inscription incomplète
 */
export function isIncompleteRegistration(role: AppRole): boolean {
  return role === 'incomplete_practitioner';
}
