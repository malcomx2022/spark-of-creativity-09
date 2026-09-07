import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { toast } from "sonner";

export interface PractitionerRate {
  id: string;
  practitioner_id: string;
  service_type: string;
  base_price: number;
  duration_minutes: number;
  created_at: string;
  updated_at: string;
}

export const usePractitionerRates = (practitionerId?: string) => {
  return useQuery({
    queryKey: ["practitioner-rates", practitionerId],
    queryFn: async () => {
      if (!practitionerId) return [];
      return api.get<PractitionerRate[]>(`/practitioners/${practitionerId}/rates`);
    },
    enabled: !!practitionerId,
  });
};

/** Le praticien est déduit du jeton : `practitioner_id` du corps est ignoré. */
export const useCreatePractitionerRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rate: Omit<PractitionerRate, "id" | "created_at" | "updated_at">) => {
      return api.post<PractitionerRate>("/practitioners/me/rates", {
        serviceType: rate.service_type,
        basePrice: rate.base_price,
        durationMinutes: rate.duration_minutes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-rates"] });
      toast.success("Tarif ajouté avec succès");
    },
    onError: (error: unknown) => {
      toast.error("Erreur lors de l'ajout du tarif : " + errorMessage(error, "erreur inconnue"));
    },
  });
};

export const useUpdatePractitionerRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PractitionerRate> & { id: string }) => {
      return api.patch<PractitionerRate>(`/practitioners/me/rates/${id}`, {
        ...(updates.service_type !== undefined ? { serviceType: updates.service_type } : {}),
        ...(updates.base_price !== undefined ? { basePrice: updates.base_price } : {}),
        ...(updates.duration_minutes !== undefined ? { durationMinutes: updates.duration_minutes } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-rates"] });
      toast.success("Tarif modifié avec succès");
    },
    onError: (error: unknown) => {
      toast.error("Erreur lors de la modification : " + errorMessage(error, "erreur inconnue"));
    },
  });
};

export const useDeletePractitionerRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/practitioners/me/rates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-rates"] });
      toast.success("Tarif supprimé avec succès");
    },
    onError: (error: unknown) => {
      toast.error("Erreur lors de la suppression : " + errorMessage(error, "erreur inconnue"));
    },
  });
};
