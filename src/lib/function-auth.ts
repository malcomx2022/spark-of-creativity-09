import { getAccessToken } from "@/lib/api";

/**
 * En-tête d'authentification pour les appels HTTP directs (ex Edge Functions).
 * Conservé pour les écrans admin non encore migrés sur `src/lib/api` ; à supprimer à l'étape 7c.
 */
export async function getFunctionAuthHeaders() {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Session expirée. Veuillez vous reconnecter puis réessayer.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}
