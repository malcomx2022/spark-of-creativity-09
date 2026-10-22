import { Fragment, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { auth, type AuthSession } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { type AppRole, resolveUserRole, getDashboardPathForRole } from '@/lib/userRoleResolver';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { rememberReturnPath } from '@/lib/return-path';

// Cache mémoire pour les rôles utilisateur (évite les appels répétés)
// P4 FIX: Réduit à 1 minute pour limiter le risque d'accès après révocation de rôle
const roleCache = new Map<string, { role: AppRole; timestamp: number }>();
const ROLE_CACHE_DURATION = 1 * 60 * 1000; // 1 minute (réduit depuis 5 min pour sécurité)

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
  const [session, setSession] = useState<AuthSession | null>(() => auth.getSession());
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>(() => (auth.getSession() ? 'authenticated' : 'unauthenticated'));
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [roleStatus, setRoleStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const location = useLocation();

  // Initialize idle timeout for auto-logout
  useIdleTimeout();

  useEffect(() => {
    // La session est lue localement (jetons conservés par src/lib/api/session.ts) ; un jeton
    // expiré est renouvelé de façon transparente par le client API au premier appel.
    return auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');

      // Invalider le cache de rôle si déconnexion
      if (!nextSession) {
        roleCache.clear();
      }
    });
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
    // Retour à cette page après connexion (session expirée, notification ouverte hors session).
    rememberReturnPath(`${location.pathname}${location.search}`);
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && roleStatus === 'ready' && !userRole) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to={redirectForRole()} replace state={{ from: location }} />;
  }

  return <Fragment key={session?.user.id}>{children}</Fragment>;
}
