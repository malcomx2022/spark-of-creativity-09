import { supabase as supabaseClient } from '@/integrations/supabase/client';

/**
 * Returns a guaranteed non-null Supabase client instance.
 * Throws an error if Supabase is not initialized (missing env vars).
 * 
 * Use this instead of importing supabase directly to avoid null checks everywhere.
 */
export function getSupabase() {
  if (!supabaseClient) {
    throw new Error(
      'Supabase client is not initialized. Please check your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
    );
  }
  return supabaseClient;
}

// Re-export the client for backwards compatibility (but prefer getSupabase())
export const supabase = supabaseClient;
