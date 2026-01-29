import { supabase } from "@/integrations/supabase/client";

/**
 * Certains déploiements externes n'injectent pas toujours automatiquement le JWT
 * dans supabase.functions.invoke(). On force donc l'envoi du Bearer token.
 */
export async function getFunctionAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Session expirée. Veuillez vous reconnecter puis réessayer.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}
