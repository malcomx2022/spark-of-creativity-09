import { supabase } from "@/integrations/supabase/client";

const COACH_TYPE = "coach_sportif";

export async function getDashboardPathForUser(userId: string) {
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
