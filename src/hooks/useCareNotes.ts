import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '@/lib/api';

/** Ligne `care_notes` (colonnes snake_case renvoyées par l'API). */
export interface CareNote {
  id: string;
  appointment_id: string;
  practitioner_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  attachments?: string[] | null;
  shared_with_patient: boolean;
  created_at: string;
  updated_at: string;
}

export interface CareNoteWithAppointment extends CareNote {
  appointments?: {
    practitioner_name: string;
    patient_name: string;
    date: string;
    specialty: string;
  };
  /** Rendez-vous introuvable côté API (données affichées par défaut). */
  _hasMissingAppointmentData?: boolean;
}

/** Corps de création : `practitioner_id` est déduit du jeton par l'API (conservé pour compatibilité). */
export interface CareNoteInsert {
  appointment_id: string;
  practitioner_id?: string;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  attachments?: string[] | null;
  shared_with_patient?: boolean;
}

export type CareNoteUpdate = Omit<CareNoteInsert, 'appointment_id' | 'practitioner_id'>;

/** Ligne renvoyée par GET /care-notes (jointure aplatie avec `appointments`). */
interface CareNoteRow extends CareNote {
  patient_name?: string | null;
  practitioner_name?: string | null;
  appointment_date?: string | null;
  specialty?: string | null;
}

function toCareNoteDto(data: CareNoteUpdate) {
  return {
    ...(data.subjective !== undefined ? { subjective: data.subjective } : {}),
    ...(data.objective !== undefined ? { objective: data.objective } : {}),
    ...(data.assessment !== undefined ? { assessment: data.assessment } : {}),
    ...(data.plan !== undefined ? { plan: data.plan } : {}),
    ...(data.attachments !== undefined && data.attachments !== null ? { attachments: data.attachments } : {}),
    ...(data.shared_with_patient !== undefined ? { sharedWithPatient: data.shared_with_patient } : {}),
  };
}

function toCareNoteWithAppointment(row: CareNoteRow): CareNoteWithAppointment {
  const { patient_name, practitioner_name, appointment_date, specialty, ...note } = row;
  const hasMissingData = !appointment_date && !patient_name;

  return {
    ...note,
    // ✅ CORRECTION P1-11: Ajouter un indicateur pour les données manquantes
    _hasMissingAppointmentData: hasMissingData,
    appointments: {
      practitioner_name: practitioner_name || 'Praticien',
      patient_name: patient_name || (hasMissingData ? 'Patient (données indisponibles)' : 'Patient'),
      date: appointment_date || note.created_at || new Date().toISOString(),
      specialty: specialty || 'Consultation',
    },
  };
}

/** Notes SOAP du praticien connecté (l'API déduit le praticien du jeton ; `practitionerId` ne sert qu'à activer la requête). */
export function useCareNotes(practitionerId?: string) {
  return useQuery<CareNoteWithAppointment[]>({
    queryKey: ['care-notes', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      const rows = await api.get<CareNoteRow[]>('/care-notes');
      return (rows || []).map(toCareNoteWithAppointment);
    },
    enabled: !!practitionerId,
  });
}

export function useCreateCareNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CareNoteInsert) => {
      const { appointment_id, practitioner_id: _ignored, ...rest } = data;
      return api.post<CareNote>('/care-notes', {
        appointmentId: appointment_id,
        ...toCareNoteDto(rest),
      });
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['care-notes'] });
      if (note?.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['care-note', 'appointment', note.appointment_id] });
      }
    },
  });
}

export function useUpdateCareNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CareNoteUpdate }) => {
      return api.patch<CareNote>(`/care-notes/${id}`, toCareNoteDto(data));
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['care-notes'] });
      if (note?.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['care-note', 'appointment', note.appointment_id] });
      }
    },
  });
}

/** Partage la note avec le patient : notification + message dans la conversation, journal côté API. */
export function useShareCareNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.post<CareNote>(`/care-notes/${id}/share`);
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: ['care-notes'] });
      if (note?.appointment_id) {
        queryClient.invalidateQueries({ queryKey: ['care-note', 'appointment', note.appointment_id] });
      }
    },
  });
}

export function useCareNoteByAppointment(appointmentId?: string) {
  return useQuery<CareNote | null>({
    queryKey: ['care-note', 'appointment', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return null;
      try {
        return (await api.get<CareNote | null>(`/care-notes/appointment/${appointmentId}`)) ?? null;
      } catch (error) {
        if (isApiError(error, 404)) return null;
        throw error;
      }
    },
    enabled: !!appointmentId,
  });
}
