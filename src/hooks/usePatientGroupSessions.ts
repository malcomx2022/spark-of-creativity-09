import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, onTableChange } from '@/lib/api';

export interface PatientGroupSession {
  id: string;
  session_id: string;
  patient_id: string;
  joined_at: string;
  payment_status: string;
  session: {
    id: string;
    session_name: string;
    session_type: string;
    max_participants: number;
    min_participants: number;
    current_participants: number;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    price_per_person: number;
    location: string;
    status: string;
    description?: string;
    coach: {
      id: string;
      name: string;
      image?: string;
      specialty: string;
    };
  };
}

/** Inscriptions du patient connecté avec séance et coach : `GET /api/group-sessions/mine`. */
export function usePatientGroupSessions(patientId?: string, page = 0, pageSize = 20) {
  const query = useQuery({
    queryKey: ['patient-group-sessions', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [] as PatientGroupSession[], count: 0 };
      return api.get<{ data: PatientGroupSession[]; count: number }>('/group-sessions/mine', { query: { page, limit: pageSize } });
    },
    enabled: !!patientId
  });

  // Écouter les mises à jour en temps réel (inscriptions, paiements, séances)
  const refetch = query.refetch;
  useEffect(() => {
    if (!patientId) return;
    return onTableChange(['group_session_participants', 'group_sessions', 'payments'], () => {
      void refetch();
    });
  }, [patientId, refetch]);

  return query;
}
