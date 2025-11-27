import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';

// Define user roles
export type AppRole = "admin" | "patient" | "practitioner";

// A mock function to get user role. Replace with actual logic later.
// For example, from Supabase JWT: user.app_metadata.roles
const getUserRole = (user: User | null): AppRole[] => {
  if (!user) return [];
  // This is a mock. In a real app, you'd get this from the user's metadata.
  // For now, let's assume the email gives a hint.
  if (user.email?.includes('admin')) return ['admin'];
  if (user.email?.includes('patient')) return ['patient'];
  if (user.email?.includes('practitioner')) return ['practitioner'];
  return ['patient']; // Default to patient
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
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
    const supabaseClient = supabase;
    if (supabaseClient) {
      const checkUser = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session?.user) {
          setLoading(false);
          navigate('/login');
          return;
        }

        setUser(session.user);
        const userRoles = getUserRole(session.user);

        if (allowedRoles && allowedRoles.length > 0) {
          const hasPermission = userRoles.some(role => allowedRoles.includes(role));
          if (!hasPermission) {
            navigate('/'); // Redirect to home if no permission
            return;
          }
        }

        setLoading(false);
      };

      checkUser();

      const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          navigate('/login');
        } else {
          setUser(session.user);
        }
      });

      return () => {
        if (authListener?.subscription) {
          authListener.subscription.unsubscribe();
        }
      };
    } else {
      setLoading(false);
      navigate('/login');
    }
  }, [navigate, allowedRoles]);

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

        if (metadata.user_type === 'patient') {
          resolvedRole = 'patient';
        }

        if (metadata.role === 'practitioner') {
          resolvedRole = 'practitioner';
        }

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

        if (
          resolvedRole === 'practitioner' &&
          allowedRoles?.some(role => role === 'coach')
        ) {
          const { data: practitioner, error: practitionerError } = await supabase
            .from('practitioners')
            .select('practitioner_type')
            .eq('user_id', userData.user?.id)
            .maybeSingle();

          if (practitionerError && practitionerError.code !== 'PGRST116') {
            throw practitionerError;
          }

          if (practitioner?.practitioner_type === 'coach_sportif') {
            resolvedRole = 'coach';
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