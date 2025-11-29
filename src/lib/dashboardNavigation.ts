import { resolveUserRole, resolveUserRoleFromAuth, getDashboardPathForRole } from './userRoleResolver';

/**
 * Obtient le chemin du dashboard pour un utilisateur spécifique
 * @param userId - L'ID de l'utilisateur
 * @returns Le chemin du dashboard approprié
 */
export async function getDashboardPathForUser(userId: string): Promise<string> {
  const { role } = await resolveUserRole(userId);
  return getDashboardPathForRole(role);
}

/**
 * Obtient le chemin du dashboard pour l'utilisateur authentifié actuel
 * @returns Le chemin du dashboard approprié
 */
export async function getDashboardPathFromAuth(): Promise<string> {
  const { role } = await resolveUserRoleFromAuth();
  return getDashboardPathForRole(role);
}
