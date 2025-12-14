import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import type { Appointment, AppointmentStatus, CreateAppointmentData } from '@/types/appointment';
import { withTimeout } from '@/lib/network-timeout';
import { formatDateWithDateFns } from '@/lib/date-utils';
import { useEffect } from 'react';

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
    paymentAmount: row.payment_amount ?? null,
  };
}

async function fetchAppointmentsByField(field: 'patient_id' | 'practitioner_id', id?: string) {
  if (!id) {
    return [];
  }

  const { data, error } = await withTimeout(
    supabase
      .from('appointments')
      .select('*')
      .eq(field, id)
      .order('date', { ascending: true })
  );

  if (error) {
    throw error;
  }

  return (data ?? []).map(toAppointment);
}

async function insertAppointment(payload: TablesInsert<'appointments'>) {
  const { error, data } = await withTimeout(
    supabase
      .from('appointments')
      .insert(payload)
      .select()
      .single()
  );

  if (error) {
    throw error;
  }

  return toAppointment(data);
}

async function updateAppointment(id: string, payload: TablesUpdate<'appointments'>) {
  const { error, data } = await withTimeout(
    supabase
      .from('appointments')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
  );

  if (error) {
    throw error;
  }

  return toAppointment(data);
}

export function usePatientAppointments(patientId?: string, page = 0, pageSize = 100) {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['appointments', 'patient', patientId, page],
    queryFn: async () => {
      if (!patientId) return { data: [], count: 0 };

      const { data, error, count } = await withTimeout(
        supabase
          .from('appointments')
          .select('*', { count: 'exact' })
          .eq('patient_id', patientId)
          .order('date', { ascending: false })
          .order('time', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)
      );

      if (error) throw error;
      return { data: (data ?? []).map(toAppointment), count: count || 0 };
    },
    enabled: !!patientId,
  });

  // Écouter les mises à jour en temps réel
  useEffect(() => {
    if (!patientId) return;

    const channel = supabase
      .channel('patient-appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `patient_id=eq.${patientId}`
        },
        (payload) => {
          console.log('📅 Realtime update for appointments:', payload);
          queryClient.invalidateQueries({ queryKey: ['appointments', 'patient', patientId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientId, queryClient]);

  return query;
}

export function usePractitionerAppointments(practitionerId?: string, page = 0, pageSize = 100) {
  return useQuery({
    queryKey: ['appointments', 'practitioner', practitionerId, page],
    queryFn: async () => {
      if (!practitionerId) return { data: [], count: 0 };

      const { data, error, count } = await withTimeout(
        supabase
          .from('appointments')
          .select('*', { count: 'exact' })
          .eq('practitioner_id', practitionerId)
          .order('date', { ascending: false })
          .order('time', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)
      );

      if (error) throw error;
      return { data: (data ?? []).map(toAppointment), count: count || 0 };
    },
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

      const currentUser = await supabase.auth.getUser();
      if (!currentUser.data.user) throw new Error('Utilisateur non connecté');

      // ✅ VALIDATION ANTI-DOUBLON : Vérifier s'il existe déjà un RDV actif avec ce praticien à cette date
      if (data.practitionerId) {
        // Utiliser le formatage local pour éviter les décalages de fuseau horaire
        const dateObj = new Date(data.date);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const appointmentDate = `${year}-${month}-${day}`;
        
        const { data: existingAppointments, error: checkError } = await withTimeout(
          supabase
            .from('appointments')
            .select('date, time, practitioner_name')
            .eq('patient_id', patientId)
            .eq('practitioner_id', data.practitionerId)
            .eq('date', appointmentDate)
            .not('status', 'in', '(cancelled,rejected,completed,cancelled_unpaid)')
        );

        if (checkError) throw checkError;

        if (existingAppointments && existingAppointments.length > 0) {
          const existing = existingAppointments[0];
          const formattedDate = formatDateWithDateFns(existing.date);
          throw new Error(
            `Vous avez déjà un rendez-vous prévu avec ${existing.practitioner_name} le ${formattedDate} à ${existing.time}.\n\n` +
            `Veuillez choisir une autre date ou annuler le rendez-vous existant.`
          );
        }
      }
      
      const profile = await withTimeout(
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', currentUser.data.user.id)
          .single()
      );

      const addresses = await withTimeout(
        supabase
          .from('addresses')
          .select('*')
          .eq('user_id', currentUser.data.user.id)
          .eq('is_default', true)
          .maybeSingle()
      );

      // Formater la date en utilisant le fuseau horaire local pour éviter les décalages UTC
      const dateObj = new Date(data.date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;

      const appointment = await insertAppointment({
        patient_id: patientId,
        patient_name: profile.data?.full_name || patientName || 'Patient',
        practitioner_id: data.practitionerId || '',
        practitioner_name: data.practitionerName || '',
        specialty: data.specialty,
        date: formattedDate,
        time: data.time,
        reason: data.reason,
        urgency_level: data.urgencyLevel,
        status: 'awaiting_practitioner',
        address: data.addressOverride || addresses.data?.address || 'Adresse à préciser',
        duration: 60,
      });

      // Envoyer une notification au praticien après création du RDV
      if (data.practitionerId) {
        try {
          await supabase.functions.invoke('notify-appointment-request', {
            body: {
              appointmentId: appointment.id,
              practitionerId: data.practitionerId,
              patientName: profile.data?.full_name || patientName || 'Patient',
              date: formattedDate,
              time: data.time,
              reason: data.reason,
              specialty: data.specialty,
            }
          });
          console.log('✅ Notification envoyée au praticien');
        } catch (notifError) {
          console.error('⚠️ Erreur notification praticien (non bloquant):', notifError);
        }
      }

      return appointment;
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
