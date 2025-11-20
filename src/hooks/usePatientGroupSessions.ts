import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

export function usePatientGroupSessions(patientId?: string) {
  return useQuery({
    queryKey: ['patient-group-sessions', patientId],
    queryFn: async () => {
      if (!patientId) return [];

      const { data, error } = await supabase
        .from('group_session_participants')
        .select(`
          id,
          session_id,
          patient_id,
          joined_at,
          payment_status,
          session:group_sessions!inner(
            id,
            session_name,
            session_type,
            max_participants,
            min_participants,
            current_participants,
            scheduled_date,
            start_time,
            end_time,
            price_per_person,
            location,
            status,
            description,
            coach:practitioners!inner(
              id,
              name,
              image,
              specialty
            )
          )
        `)
        .eq('patient_id', patientId)
        .order('joined_at', { ascending: false });

      if (error) {
        console.error('Error fetching patient group sessions:', error);
        throw error;
      }

      // Transformer les données pour avoir une structure plus propre
      return data.map(item => ({
        id: item.id,
        session_id: item.session_id,
        patient_id: item.patient_id,
        joined_at: item.joined_at,
        payment_status: item.payment_status,
        session: {
          ...(Array.isArray(item.session) ? item.session[0] : item.session),
          coach: Array.isArray(item.session) 
            ? (Array.isArray(item.session[0]?.coach) ? item.session[0].coach[0] : item.session[0]?.coach)
            : (Array.isArray(item.session?.coach) ? item.session.coach[0] : item.session?.coach)
        }
      })) as PatientGroupSession[];
    },
    enabled: !!patientId
  });
}
