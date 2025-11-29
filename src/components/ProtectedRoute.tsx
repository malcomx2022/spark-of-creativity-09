import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { type AppRole, resolveUserRole, getDashboardPathForRole } from '@/lib/userRoleResolver';

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
        const { role } = await resolveUserRole(session.user.id);

        if (isMounted) {
          setUserRole(role);
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
  }, [session, status]);

  const redirectForRole = () => {
    return userRole ? getDashboardPathForRole(userRole) : '/';
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