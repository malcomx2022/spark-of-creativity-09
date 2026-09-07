import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { auth } from '@/lib/api';
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
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>(() => (auth.getSession() ? 'loading' : 'unauthenticated'));
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const resolveRedirect = async () => {
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
    };

    if (auth.getSession()) void resolveRedirect();

    const unsubscribe = auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      if (nextSession) {
        void resolveRedirect();
      } else {
        setStatus('unauthenticated');
        setRedirectPath(null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
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
