import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, isApiError, onTableChange } from '@/lib/api';
import type { Appointment, AppointmentStatus, CreateAppointmentData, PractitionerTrackingStatus } from '@/types/appointment';

export type { Appointment } from '@/types/appointment';

/** Ligne `appointments` telle que renvoyée par l'API (snake_case, comme l'ancienne réponse Supabase). */
export interface AppointmentRow {
  id: string;
  patient_id: string;
  patient_name: string | null;
  practitioner_id: string | null;
  practitioner_name: string | null;
  specialty: string | null;
  date: string | null;
  time: string | null;
  duration: number | null;
  status: string | null;
  address: string | null;
  reason: string | null;
  notes: string | null;
  internal_notes?: string | null;
  urgency_level: string | null;
  payment_amount: number | null;
  practitioner_status?: string | null;
  practitioner_latitude?: number | null;
  practitioner_longitude?: number | null;
  practitioner_last_location_update?: string | null;
  patient_confirmed_at?: string | null;
  consultation_started_at?: string | null;
  consultation_ended_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Limite maximale acceptée par `GET /appointments`. */
const API_LIST_LIMIT = 200;

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    patientName: row.patient_name ?? 'Patient',
    patientId: row.patient_id,
    // ✅ CORRECTION P2-9: Utiliser chaîne vide au lieu de 'pending' (invalide comme UUID)
    practitionerId: row.practitioner_id ?? '',
    practitionerName: row.practitioner_name ?? "En attente d'attribution",
    specialty: row.specialty ?? 'Non spécifié',
    date: row.date ?? '',
    time: row.time ?? '',
    duration: row.duration ?? 0,
    status: (row.status ?? 'pending') as AppointmentStatus,
    address: row.address ?? 'Adresse à confirmer',
    reason: row.reason ?? 'Motif non renseigné',
    notes: row.notes ?? undefined,
    urgencyLevel: row.urgency_level ?? undefined,
    paymentAmount: row.payment_amount ?? null,
  };
}

/**
 * `GET /appointments` renvoie les rendez-vous de l'utilisateur connecté (patient et/ou praticien),
 * triés par date puis heure décroissantes. La pagination reste côté client (au plus 200 lignes).
 */
async function fetchOwnAppointments(field: 'patient_id' | 'practitioner_id', id: string, page: number, pageSize: number) {
  const rows = await api.get<AppointmentRow[]>('/appointments', { query: { limit: API_LIST_LIMIT } });
  const mine = rows.filter((row) => row[field] === id);
  return { data: mine.slice(page * pageSize, (page + 1) * pageSize).map(toAppointment), count: mine.length };
}

export function usePatientAppointments(patientId?: string, page = 0, pageSize = 100) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['appointments', 'patient', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [], count: 0 };
      return fetchOwnAppointments('patient_id', patientId, page, pageSize);
    },
    enabled: !!patientId,
  });

  // Écouter les mises à jour en temps réel
  useEffect(() => {
    if (!patientId) return;

    return onTableChange('appointments', () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', patientId] });
    });
  }, [patientId, queryClient]);

  return query;
}

export function usePractitionerAppointments(practitionerId?: string, page = 0, pageSize = 100) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['appointments', 'practitioner', practitionerId, page],
    queryFn: async () => {
      if (!practitionerId) return { data: [], count: 0 };
      return fetchOwnAppointments('practitioner_id', practitionerId, page, pageSize);
    },
    enabled: !!practitionerId,
    staleTime: 0, // Toujours rafraîchir
    refetchOnMount: 'always', // Rafraîchir à chaque montage
    refetchOnWindowFocus: true, // Rafraîchir au focus
  });

  // Écouter les mises à jour en temps réel
  useEffect(() => {
    if (!practitionerId) return;

    return onTableChange('appointments', () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'practitioner', practitionerId] });
    });
  }, [practitionerId, queryClient]);

  return query;
}

/** Valeurs du formulaire (NewAppointmentDialog) → énumération de l'API. */
function toApiUrgency(level?: string): 'low' | 'normal' | 'high' | 'urgent' | undefined {
  switch (level) {
    case undefined:
    case '':
      return undefined;
    case 'low':
    case 'normal':
    case 'high':
    case 'urgent':
      return level;
    case 'non-urgent':
      return 'normal';
    case 'semi-urgent':
      return 'high';
    case 'immediate':
      return 'urgent';
    default:
      return 'normal';
  }
}

/** Date locale AAAA-MM-JJ (évite les décalages de fuseau horaire). */
function toLocalDate(value: string): string {
  const dateObj = new Date(value);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useCreateAppointment(patientId?: string, patientName?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAppointmentData) => {
      if (!patientId) {
        throw new Error('Patient non identifié');
      }
      void patientName; // Le nom du patient est déduit du profil côté API.

      if (!data.practitionerId) {
        // TODO(api): `POST /appointments` exige un praticien (practitionerId UUID). Le mode « demande sans
        // praticien » (fallbackMode de NewAppointmentDialog) n'a pas d'équivalent côté API.
        throw new Error("Aucun praticien n'a pu être associé à cette demande. Veuillez sélectionner un praticien.");
      }

      // Les règles métier (date passée, praticien validé, anti-doublon, notification du praticien)
      // sont appliquées par l'API.
      const row = await api.post<AppointmentRow>('/appointments', {
        practitionerId: data.practitionerId,
        specialty: data.specialty,
        date: toLocalDate(data.date),
        time: data.time,
        duration: 60,
        reason: data.reason,
        address: data.addressOverride || undefined,
        urgencyLevel: toApiUrgency(data.urgencyLevel),
      });

      return toAppointment(row);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', patientId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations métier (ex `update` générique de la table appointments)
// ---------------------------------------------------------------------------

export type AppointmentAction =
  | { action: 'respond'; body: { action: 'accept' | 'reject'; paymentMethod?: 'mtn' | 'moov'; reason?: string } }
  | { action: 'practitioner-status'; body: { status: Exclude<PractitionerTrackingStatus, 'assigned'>; latitude?: number; longitude?: number } }
  | { action: 'complete'; body?: { notes?: string } }
  | { action: 'confirm' }
  | { action: 'cancel'; body?: { reason?: string } }
  /** Aucune modification : relit le rendez-vous et rafraîchit les listes. */
  | { action: 'refresh' };

/**
 * Signature de compatibilité (ex `TablesUpdate<'appointments'>`) : les colonnes sont mappées vers la
 * route métier correspondante (`status` / `practitioner_status` / `notes` / `patient_confirmed_at`).
 */
export interface LegacyAppointmentUpdate {
  status?: string;
  practitioner_status?: string;
  notes?: string | null;
  internal_notes?: string | null;
  patient_confirmed_at?: string | null;
  practitioner_latitude?: number | null;
  practitioner_longitude?: number | null;
  [column: string]: unknown;
}

export type AppointmentMutationInput = ({ id: string } & AppointmentAction) | { id: string; data: LegacyAppointmentUpdate };

function legacyToAction(data: LegacyAppointmentUpdate): AppointmentAction {
  if (data.practitioner_status && data.practitioner_status !== 'assigned') {
    return {
      action: 'practitioner-status',
      body: {
        status: data.practitioner_status as Exclude<PractitionerTrackingStatus, 'assigned'>,
        latitude: data.practitioner_latitude ?? undefined,
        longitude: data.practitioner_longitude ?? undefined,
      },
    };
  }
  const notes = data.notes ?? data.internal_notes ?? undefined;
  switch (data.status) {
    case 'cancelled':
      return { action: 'cancel', body: { reason: notes ?? undefined } };
    case 'awaiting_confirmation':
      return { action: 'complete', body: { notes: notes ?? undefined } };
    case 'completed':
      // Le patient confirme (patient_confirmed_at) ; sinon le praticien clôture la consultation.
      return data.patient_confirmed_at ? { action: 'confirm' } : { action: 'complete', body: { notes: notes ?? undefined } };
    case 'pending_payment':
      return { action: 'respond', body: { action: 'accept' } };
    case 'rejected':
      return { action: 'respond', body: { action: 'reject', reason: notes ?? undefined } };
    case 'in-progress':
      return { action: 'practitioner-status', body: { status: 'in_progress' } };
    default:
      return { action: 'refresh' };
  }
}

async function runAppointmentAction(id: string, input: AppointmentAction, fromLegacy: boolean): Promise<Appointment> {
  const path = `/appointments/${id}`;
  try {
    switch (input.action) {
      case 'respond':
        await api.post(`${path}/respond`, input.body);
        break;
      case 'practitioner-status':
        return toAppointment(await api.patch<AppointmentRow>(`${path}/practitioner-status`, input.body));
      case 'complete':
        return toAppointment(await api.post<AppointmentRow>(`${path}/complete`, input.body ?? {}));
      case 'confirm':
        return toAppointment(await api.post<AppointmentRow>(`${path}/confirm`));
      case 'cancel':
        return toAppointment(await api.post<AppointmentRow>(`${path}/cancel`, input.body ?? {}));
      case 'refresh':
        break;
    }
  } catch (error) {
    // Signature de compatibilité : le statut a souvent déjà été appliqué par l'API (ex réponse du
    // praticien) ; un conflit signifie simplement que la ligne est à jour côté serveur.
    if (!(fromLegacy && isApiError(error, 409))) throw error;
  }
  return toAppointment(await api.get<AppointmentRow>(path));
}

export function useMutateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AppointmentMutationInput) => {
      if ('data' in input) return runAppointmentAction(input.id, legacyToAction(input.data), true);
      const { id, ...action } = input;
      return runAppointmentAction(id, action, false);
    },
    onSuccess: (appointment) => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', appointment.patientId] });
      queryClient.invalidateQueries({ queryKey: ['appointments', 'practitioner', appointment.practitionerId] });
    },
  });
}
