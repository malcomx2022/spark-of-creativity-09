import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

export type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

function ProtectedRouteSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [roleStatus, setRoleStatus] = useState<'idle' | 'loading' | 'ready'>('idle');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setStatus('unauthenticated');
        return;
      }

      setSession(session);
      setStatus('authenticated');
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setStatus(session ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      subscription.unsubscribe();
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

        // Vérifier le user_type dans les métadonnées (uniformisé pour patient et practitioner)
        if (metadata.user_type === 'patient') {
          resolvedRole = 'patient';
        }

        if (metadata.user_type === 'practitioner') {
          // Vérifier si c'est un coach sportif directement dans les métadonnées
          if (metadata.practitioner_type === 'coach_sportif') {
            resolvedRole = 'coach';
          } else {
            resolvedRole = 'practitioner';
          }
        }

        // Pour les admins, vérifier la table user_roles (car non stocké dans metadata)
        if (allowedRoles?.includes('admin')) {
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
