import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/userRoleResolver';

/** Compatibilité des notifications déjà enregistrées avec /dashboard?tab=… */
export default function DashboardRedirect() {
  const location = useLocation();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['dashboard-redirect-role'], queryFn: () => auth.me(), retry: false });
  if (isLoading) return <p role="status">Ouverture de votre espace…</p>;
  if (isError) return <div role="alert">Impossible d’ouvrir votre espace. <button onClick={() => void refetch()}>Réessayer</button></div>;
  if (!data) return <Navigate to="/login" replace />;
  return <Navigate to={`${getDashboardPathForRole(data.role)}${location.search}${location.hash}`} replace />;
}
