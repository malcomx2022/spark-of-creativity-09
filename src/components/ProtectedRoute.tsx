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

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  if (loading) {
    return <div>Chargement...</div>;
  }

  return user ? <>{children}</> : null;
}