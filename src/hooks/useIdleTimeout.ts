import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const WARNING_BEFORE_TIMEOUT = 60 * 1000; // 1 minute warning

export function useIdleTimeout() {
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const logout = useCallback(async () => {
    setShowWarning(false);
    await supabase.auth.signOut();
    localStorage.removeItem('user_type');
    localStorage.removeItem('practitioner_id');
    toast({
      title: "Session expirée",
      description: "Vous avez été déconnecté pour inactivité.",
      variant: "destructive",
    });
    navigate('/login', { replace: true });
  }, [navigate]);

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
