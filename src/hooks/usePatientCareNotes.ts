import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface CareNote {
  id: string;
  appointment_id: string;
  practitioner_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  shared_with_patient: boolean;
  created_at: string;
  updated_at: string;
  appointments?: {
    practitioner_name: string;
    date: string;
    specialty?: string;
  };
}

/** Ligne renvoyée par GET /care-notes/mine (jointure aplatie avec `appointments`). */
interface PatientCareNoteRow extends Omit<CareNote, 'appointments'> {
  practitioner_name?: string | null;
  appointment_date?: string | null;
  specialty?: string | null;
}

/** Notes partagées avec le patient connecté (l'API déduit le patient du jeton ; `patientId` ne sert qu'à activer la requête). */
export function usePatientCareNotes(patientId?: string, page = 0, pageSize = 20) {
  return useQuery({
    queryKey: ['patient-care-notes', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [] as CareNote[], count: 0 };

      // ✅ Uniquement les notes partagées avec le patient (filtre appliqué côté API)
      const { data, count } = await api.get<{ data: PatientCareNoteRow[]; count: number }>('/care-notes/mine', {
        query: { page, limit: pageSize },
      });

      const notes: CareNote[] = (data || []).map(({ practitioner_name, appointment_date, specialty, ...note }) => ({
        ...note,
        appointments: {
          practitioner_name: practitioner_name || 'Praticien',
          date: appointment_date || note.created_at,
          specialty: specialty || undefined,
        },
      }));

      return { data: notes, count: count || 0 };
    },
    enabled: !!patientId,
    staleTime: 30000,
  });
}
