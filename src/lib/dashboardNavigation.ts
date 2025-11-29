import { resolveUserRole, resolveUserRoleFromAuth, getDashboardPathForRole } from "./userRoleResolver";

/**
 * Obtient le chemin du dashboard approprié pour un utilisateur donné
 * @param userId - L'ID de l'utilisateur
 * @returns Le chemin du dashboard
 */
export async function getDashboardPathForUser(userId: string): Promise<string> {
  const { role } = await resolveUserRole(userId);
  return getDashboardPathForRole(role);
}

/**
 * Obtient le chemin du dashboard approprié pour l'utilisateur authentifié
 * @returns Le chemin du dashboard
 */
export async function getDashboardPathFromAuth(): Promise<string> {
  const { role } = await resolveUserRoleFromAuth();
  return getDashboardPathForRole(role);
}
