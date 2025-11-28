import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

function ProtectedRouteSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/10 p-6">
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [roleStatus, setRoleStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const syncSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        console.error('Unable to retrieve current session:', error);
        setSession(null);
        setStatus('unauthenticated');
        return;
      }

      setSession(data.session ?? null);
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
    };

    void syncSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession ?? null);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) {
      return;
    }

    let isMounted = true;

    const resolveRole = async () => {
      setRoleStatus('loading');

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        const metadata = userData.user?.user_metadata ?? {};
        let resolvedRole: AppRole | null = null;

        // PRIORITÉ 1: Vérifier d'abord si c'est un admin (car les admins peuvent avoir d'autres metadata)
        const { data: adminRole, error: adminError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userData.user?.id)
          .maybeSingle();

        if (adminError && adminError.code !== 'PGRST116') {
          throw adminError;
        }

        if (adminRole?.role) {
          resolvedRole = 'admin';
        }

        // PRIORITÉ 2: Vérifier le user_type dans les métadonnées (seulement si pas admin)
        if (!resolvedRole && metadata.user_type === 'patient') {
          resolvedRole = 'patient';
        }

        if (!resolvedRole && metadata.user_type === 'practitioner') {
          // Vérifier si c'est un coach sportif directement dans les métadonnées
          if (metadata.practitioner_type === 'coach_sportif') {
            resolvedRole = 'coach';
          } else {
            resolvedRole = 'practitioner';
          }
        }

        // PRIORITÉ 3: Fallback - vérifier la table practitioners
        if (!resolvedRole) {
          const { data: practitionerData, error: practitionerError } = await supabase
            .from('practitioners')
            .select('practitioner_type')
            .eq('user_id', userData.user?.id)
            .maybeSingle();

          if (!practitionerError && practitionerData) {
            if (practitionerData.practitioner_type === 'coach_sportif') {
              resolvedRole = 'coach';
            } else {
              resolvedRole = 'practitioner';
            }
          } else if (!resolvedRole) {
            // Si toujours pas de rôle trouvé, considérer comme patient par défaut
            resolvedRole = 'patient';
          }
        }

        if (isMounted) {
          setUserRole(resolvedRole);
          setRoleStatus('ready');
        }
      } catch (error) {
        console.error('Unable to resolve user role:', error);
        if (isMounted) {
          setRoleStatus('ready');
        }
      }
    };

    void resolveRole();

    return () => {
      isMounted = false;
    };
  }, [allowedRoles, session, status]);

  const redirectForRole = () => {
    if (userRole === 'patient') return '/dashboard/patient';
    if (userRole === 'coach') return '/dashboard/coach';
    if (userRole === 'practitioner') return '/dashboard/practitioner';
    if (userRole === 'admin') return '/admin';
    return '/';
  };

  if (status === 'loading' || (status === 'authenticated' && roleStatus === 'loading')) {
    return <ProtectedRouteSkeleton />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && roleStatus === 'ready' && !userRole) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to={redirectForRole()} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}