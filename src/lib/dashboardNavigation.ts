import { supabase } from "@/integrations/supabase/client";

const COACH_TYPE = "coach_sportif";

export async function getDashboardPathForUser(userId: string) {
  // PRIORITÉ 1: Vérifier si l'utilisateur est un admin
  const { data: adminRole, error: adminError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (!adminError && adminRole?.role) {
    return "/admin";
  }

  // PRIORITÉ 2: Vérifier si c'est un praticien ou coach
  const { data: practitioner, error } = await supabase
    .from("practitioners")
    .select("practitioner_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Unable to resolve practitioner profile:", error);
  }

  if (practitioner?.practitioner_type === COACH_TYPE) {
    return "/dashboard/coach";
  }

  if (practitioner) {
    return "/dashboard/practitioner";
  }

  // PRIORITÉ 3: Par défaut, c'est un patient
  return "/dashboard/patient";
}

export async function getDashboardPathFromAuth() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Unable to resolve authenticated user:", error);
    return "/dashboard/patient";
  }

  const user = data.user;

  if (!user) {
    return "/dashboard/patient";
  }

  return getDashboardPathForUser(user.id);
}
