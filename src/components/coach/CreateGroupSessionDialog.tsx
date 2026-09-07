import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { GroupSessionForm, GroupSessionFormData } from "./GroupSessionForm";
import { sessionFormSchema, sanitizeSessionFormData, MIN_SESSION_PRICE } from "@/lib/session-validation";
import { withTimeout } from "@/lib/network-timeout";

interface CreateGroupSessionDialogProps {
  coachId: string;
}

const initialFormData: GroupSessionFormData = {
  session_name: "",
  session_type: "groupe",
  max_participants: 10,
  min_participants: 3,
  scheduled_date: "",
  start_time: "",
  end_time: "",
  price_per_person: MIN_SESSION_PRICE,
  location: "",
  description: ""
};

// Helper pour extraire les erreurs Zod (compatible v3 et v4)
function getZodErrors(error: unknown): Array<{ path: (string | number)[]; message: string }> {
  if (error && typeof error === 'object') {
    if ('issues' in error && Array.isArray((error as any).issues)) {
      return (error as any).issues;
    }
    if ('errors' in error && Array.isArray((error as any).errors)) {
      return (error as any).errors;
    }
  }
  return [];
}

export function CreateGroupSessionDialog({ coachId }: CreateGroupSessionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<GroupSessionFormData>(initialFormData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFieldErrors({});

    try {
      // Sanitize and validate form data with Zod
      const sanitizedData = sanitizeSessionFormData(formData);
      const validationResult = sessionFormSchema.safeParse(sanitizedData);
      
      if (!validationResult.success) {
        // Collect all field errors
        const zodErrors = getZodErrors(validationResult.error);
        const errors: Record<string, string> = {};
        zodErrors.forEach(err => {
          const field = String(err.path[0]);
          if (!errors[field]) {
            errors[field] = err.message;
          }
        });
        setFieldErrors(errors);
        
        const firstError = zodErrors[0];
        toast({
          title: "Erreur de validation",
          description: firstError?.message || "Veuillez vérifier les champs du formulaire",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Conflit de créneau, type de praticien et bornes de prix vérifiés par l'API (409 / 403 / 400)
      void coachId;
      await api.post('/group-sessions', {
        sessionName: validationResult.data.session_name,
        sessionType: validationResult.data.session_type,
        maxParticipants: validationResult.data.max_participants,
        minParticipants: validationResult.data.min_participants,
        scheduledDate: validationResult.data.scheduled_date,
        startTime: validationResult.data.start_time,
        endTime: validationResult.data.end_time,
        pricePerPerson: validationResult.data.price_per_person,
        location: validationResult.data.location,
        description: validationResult.data.description || null,
      });

      toast({
        title: "Séance créée !",
        description: "La séance de groupe a été créée avec succès",
      });

      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      
      setOpen(false);
      setFormData(initialFormData);
      setFieldErrors({});
    } catch (error: any) {
      console.error("Erreur création séance:", error);
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue lors de la création de la séance",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      setFormData(initialFormData);
      setFieldErrors({});
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="practitioner" className="gap-2">
          <Plus className="h-4 w-4" />
          Créer une séance de groupe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer une séance de groupe</DialogTitle>
          <DialogDescription>
            Planifiez une nouvelle séance pour vos clients
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <GroupSessionForm 
            formData={formData} 
            onChange={setFormData}
            fieldErrors={fieldErrors}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="practitioner" disabled={isSubmitting}>
              {isSubmitting ? "Création..." : "Créer la séance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
