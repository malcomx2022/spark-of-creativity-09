import { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { type AppRole, resolveUserRole, getDashboardPathForRole } from '@/lib/userRoleResolver';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

// Cache mémoire pour les rôles utilisateur (évite les appels répétés)
const roleCache = new Map<string, { role: AppRole; timestamp: number }>();
const ROLE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
  const hasCheckedSession = useRef(false);
  
  // Initialize idle timeout for auto-logout
  useIdleTimeout();

  useEffect(() => {
    let isMounted = true;

    const syncSession = async () => {
      // Éviter les appels multiples
      if (hasCheckedSession.current && session) return;
      
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        console.error('Unable to retrieve current session:', error);
        setSession(null);
        setStatus('unauthenticated');
        return;
      }

      hasCheckedSession.current = true;
      setSession(data.session ?? null);
      setStatus(data.session ? 'authenticated' : 'unauthenticated');
    };

    void syncSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession ?? null);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
      
      // Invalider le cache de rôle si déconnexion
      if (!nextSession) {
        roleCache.clear();
      }
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
    const userId = session.user.id;

    const resolveRole = async () => {
      // Vérifier le cache d'abord
      const cached = roleCache.get(userId);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < ROLE_CACHE_DURATION) {
        if (isMounted) {
          setUserRole(cached.role);
          setRoleStatus('ready');
        }
        return;
      }

      setRoleStatus('loading');

      try {
        const { role } = await resolveUserRole(userId);

        if (isMounted) {
          // Mettre en cache le rôle
          roleCache.set(userId, { role, timestamp: now });
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
    // Si une déconnexion est en cours, rediriger vers l'accueil au lieu de login
    const isLoggingOut = sessionStorage.getItem('logging_out') === 'true';
    if (isLoggingOut) {
      sessionStorage.removeItem('logging_out');
      return <Navigate to="/" replace />;
    }
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