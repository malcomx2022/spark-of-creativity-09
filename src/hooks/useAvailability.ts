import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export interface PractitionerAvailability {
  id: string;
  practitioner_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface PractitionerException {
  id: string;
  practitioner_id: string;
  date: string;
  reason: string | null;
  is_available: boolean | null;
  created_at: string;
}

/** Corps d'ajout d'un créneau (colonnes snake_case, comme l'ancien TablesInsert). */
export interface PractitionerAvailabilityInsert {
  practitioner_id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean | null;
}

export interface PractitionerAvailabilityUpdate {
  start_time?: string;
  end_time?: string;
  is_active?: boolean | null;
}

export interface PractitionerExceptionInsert {
  practitioner_id?: string;
  date: string;
  reason?: string | null;
  is_available?: boolean | null;
}

export function usePractitionerAvailability(practitionerId?: string) {
  return useQuery<PractitionerAvailability[]>({
    queryKey: ['availability', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      return api.get<PractitionerAvailability[]>(`/practitioners/${practitionerId}/availability`);
    },
    enabled: !!practitionerId,
  });
}

export function useCreateAvailability() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    // Le chevauchement avec un créneau existant est contrôlé par l'API (409).
    mutationFn: async (data: PractitionerAvailabilityInsert) => {
      return api.post<PractitionerAvailability>('/practitioners/me/availability', {
        dayOfWeek: data.day_of_week,
        startTime: data.start_time,
        endTime: data.end_time,
        ...(data.is_active != null ? { isActive: data.is_active } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erreur',
        description: errorMessage(error, "Impossible d'ajouter le créneau."),
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PractitionerAvailabilityUpdate }) => {
      return api.patch<PractitionerAvailability>(`/practitioners/me/availability/${id}`, {
        ...(data.start_time !== undefined ? { startTime: data.start_time } : {}),
        ...(data.end_time !== undefined ? { endTime: data.end_time } : {}),
        ...(data.is_active != null ? { isActive: data.is_active } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useDeleteAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/practitioners/me/availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function usePractitionerExceptions(practitionerId?: string) {
  return useQuery<PractitionerException[]>({
    queryKey: ['exceptions', practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      return api.get<PractitionerException[]>(`/practitioners/${practitionerId}/exceptions`);
    },
    enabled: !!practitionerId,
  });
}

export function useCreateException() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PractitionerExceptionInsert) => {
      return api.post<PractitionerException>('/practitioners/me/exceptions', {
        date: data.date,
        ...(data.reason ? { reason: data.reason } : {}),
        isAvailable: data.is_available ?? false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });
}

export function useDeleteException() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/practitioners/me/exceptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });
}
