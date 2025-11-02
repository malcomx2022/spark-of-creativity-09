import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import type { Appointment, AppointmentStatus, CreateAppointmentData } from '@/types/appointment';

function toAppointment(row: Tables<'appointments'>): Appointment {
  return {
    id: row.id,
    patientName: row.patient_name ?? 'Patient',
    patientId: row.patient_id,
    practitionerId: row.practitioner_id ?? 'pending',
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
  };
}

async function fetchAppointmentsByField(field: 'patient_id' | 'practitioner_id', id?: string) {
  if (!id) {
    return [];
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq(field, id)
    .order('date', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(toAppointment);
}

async function insertAppointment(payload: TablesInsert<'appointments'>) {
  const { error, data } = await supabase
    .from('appointments')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toAppointment(data);
}

async function updateAppointment(id: string, payload: TablesUpdate<'appointments'>) {
  const { error, data } = await supabase
    .from('appointments')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return toAppointment(data);
}

export function usePatientAppointments(patientId?: string) {
  return useQuery({
    queryKey: ['appointments', 'patient', patientId],
    queryFn: () => fetchAppointmentsByField('patient_id', patientId),
    enabled: !!patientId,
  });
}

export function usePractitionerAppointments(practitionerId?: string) {
  return useQuery({
    queryKey: ['appointments', 'practitioner', practitionerId],
    queryFn: () => fetchAppointmentsByField('practitioner_id', practitionerId),
    enabled: !!practitionerId,
  });
}

export function useCreateAppointment(patientId?: string, patientName?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAppointmentData) => {
      if (!patientId) {
        throw new Error('Patient non identifié');
      }

      return insertAppointment({
        patient_id: patientId,
        patient_name: patientName ?? 'Patient',
        practitioner_id: data.practitionerId || '',
        practitioner_name: data.practitionerName || '',
        specialty: data.specialty,
        date: data.date,
        time: data.time,
        address: '',
        reason: data.reason,
        urgency_level: data.urgencyLevel ?? null,
        status: 'pending',
        duration: 60,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', patientId] });
    },
  });
}

export function useMutateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TablesUpdate<'appointments'> }) =>
      updateAppointment(id, data),
    onSuccess: (appointment) => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', appointment.patientId] });
      queryClient.invalidateQueries({ queryKey: ['appointments', 'practitioner', appointment.practitionerId] });
    },
  });
}
