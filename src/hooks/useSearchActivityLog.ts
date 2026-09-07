import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthUser } from './useAuthUser';

export type SearchActionType = 
  | 'view_search_page'
  | 'filter_specialty'
  | 'filter_zone'
  | 'view_practitioner_details'
  | 'click_contact'
  | 'click_appointment'
  | 'click_itinerary'
  | 'close_practitioner_details'
  | 'search_text'
  | 'appointment_created';

interface LogSearchActivityParams {
  actionType: SearchActionType;
  practitionerId?: string;
  searchFilters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Générer un session ID unique pour les utilisateurs anonymes
function getOrCreateSessionId(): string {
  const storageKey = 'search_session_id';
  let sessionId = sessionStorage.getItem(storageKey);
  
  if (!sessionId) {
    sessionId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    sessionStorage.setItem(storageKey, sessionId);
  }
  
  return sessionId;
}

export function useSearchActivityLog() {
  const { data: user } = useAuthUser();
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  // Mettre à jour le session ID si l'utilisateur se connecte
  useEffect(() => {
    if (user) {
      sessionIdRef.current = `user_${user.id}_${Date.now()}`;
    }
  }, [user]);

  const logActivity = useCallback(async (params: LogSearchActivityParams) => {
    const { actionType, practitionerId, searchFilters, metadata } = params;

    try {
      // Cast to any to bypass strict type checking for the new table
      const { error } = await (supabase as any)
        .from('search_activity_logs')
        .insert({
          user_id: user?.id || null,
          session_id: sessionIdRef.current,
          action_type: actionType,
          practitioner_id: practitionerId || null,
          search_filters: searchFilters || null,
          metadata: metadata || null,
          user_agent: navigator.userAgent,
        });

      if (error && import.meta.env.DEV) {
        console.error('Erreur log activité recherche:', error);
      }
    } catch (err) {
      // Silently fail - logging should not break the app
      if (import.meta.env.DEV) {
        console.error('Erreur log activité:', err);
      }
    }
  }, [user]);

  return { logActivity, isAuthenticated: !!user };
}
