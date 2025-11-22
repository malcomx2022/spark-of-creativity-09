import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      
      const { data, error } = await supabase
        .from("practitioner_rates")
        .select("*")
        .eq("practitioner_id", practitionerId)
        .order("service_type");

      if (error) throw error;
      return data as PractitionerRate[];
    },
    enabled: !!practitionerId,
  });
};

export const useCreatePractitionerRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rate: Omit<PractitionerRate, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("practitioner_rates")
        .insert(rate)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-rates"] });
      toast.success("Tarif ajouté avec succès");
    },
    onError: (error: Error) => {
      toast.error("Erreur lors de l'ajout du tarif : " + error.message);
    },
  });
};

export const useUpdatePractitionerRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PractitionerRate> & { id: string }) => {
      const { data, error } = await supabase
        .from("practitioner_rates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-rates"] });
      toast.success("Tarif modifié avec succès");
    },
    onError: (error: Error) => {
      toast.error("Erreur lors de la modification : " + error.message);
    },
  });
};

export const useDeletePractitionerRate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("practitioner_rates")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practitioner-rates"] });
      toast.success("Tarif supprimé avec succès");
    },
    onError: (error: Error) => {
      toast.error("Erreur lors de la suppression : " + error.message);
    },
  });
};
