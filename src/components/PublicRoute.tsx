import { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { getDashboardPathFromAuth } from '@/lib/userRoleResolver';

function PublicRouteSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-6">
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

interface PublicRouteProps {
  children: React.ReactNode;
}

/**
 * PublicRoute - Bloque l'accès aux routes publiques (inscription, login) 
 * pour les utilisateurs déjà connectés et les redirige vers leur tableau de bord.
 */
export default function PublicRoute({ children }: PublicRouteProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const location = useLocation();
  const hasCheckedSession = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      if (hasCheckedSession.current) return;
      
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        console.error('PublicRoute: Unable to retrieve session:', error);
        setSession(null);
        setStatus('unauthenticated');
        return;
      }

      hasCheckedSession.current = true;
      setSession(data.session ?? null);
      
      if (data.session) {
        // Utilisateur connecté - déterminer où le rediriger
        try {
          const dashboardPath = await getDashboardPathFromAuth();
          if (isMounted) {
            setRedirectPath(dashboardPath);
            setStatus('authenticated');
          }
        } catch (err) {
          console.error('PublicRoute: Error getting dashboard path:', err);
          if (isMounted) {
            setRedirectPath('/');
            setStatus('authenticated');
          }
        }
      } else {
        setStatus('unauthenticated');
      }
    };

    void checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession ?? null);
      
      if (nextSession) {
        try {
          const dashboardPath = await getDashboardPathFromAuth();
          if (isMounted) {
            setRedirectPath(dashboardPath);
            setStatus('authenticated');
          }
        } catch {
          if (isMounted) {
            setRedirectPath('/');
            setStatus('authenticated');
          }
        }
      } else {
        setStatus('unauthenticated');
        setRedirectPath(null);
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Chargement en cours
  if (status === 'loading') {
    return <PublicRouteSkeleton />;
  }

  // Utilisateur connecté - rediriger vers son tableau de bord
  if (status === 'authenticated' && redirectPath) {
    return <Navigate to={redirectPath} replace state={{ from: location }} />;
  }

  // Utilisateur non connecté - afficher la page
  return <>{children}</>;
}
