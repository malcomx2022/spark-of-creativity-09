import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_TIMEOUT = 60 * 1000; // 1 minute warning

export function useIdleTimeout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const logout = useCallback(async () => {
    setShowWarning(false);
    
    // Clear all timers first
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = null;
    }
    
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    
    // Clear all localStorage items related to auth
    localStorage.removeItem('user_type');
    localStorage.removeItem('practitioner_id');
    localStorage.removeItem('sb-kskkufjliwdfqqyemcpf-auth-token');
    
    // Clear all React Query cache to reset app state
    queryClient.clear();
    
    // Show toast notification
    toast({
      title: "Session expirée",
      description: "Vous avez été déconnecté pour inactivité.",
      variant: "destructive",
    });
    
    // Navigate to home page and force reload to reset all state
    navigate('/', { replace: true });
    
    // Force page reload to completely reset the app state
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
  }, [navigate, queryClient]);

  const showWarningMessage = useCallback(() => {
    setShowWarning(true);
    toast({
      title: "Avertissement",
      description: "Votre session expirera dans 1 minute en raison d'inactivité.",
      variant: "destructive",
      duration: 10000,
    });
  }, []);

  const resetTimer = useCallback(() => {
    setShowWarning(false);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
    }

    // Set warning timer (14 minutes)
    warningRef.current = setTimeout(() => {
      showWarningMessage();
    }, IDLE_TIMEOUT - WARNING_BEFORE_TIMEOUT);

    // Set logout timer (15 minutes)
    timeoutRef.current = setTimeout(() => {
      logout();
    }, IDLE_TIMEOUT);
  }, [logout, showWarningMessage]);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      resetTimer();
    };

    // Initial timer setup
    resetTimer();

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      // Cleanup
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningRef.current) {
        clearTimeout(warningRef.current);
      }
    };
  }, [resetTimer]);

  return { showWarning, resetTimer };
}
