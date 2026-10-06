import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { GroupSessionForm, GroupSessionFormData } from "./GroupSessionForm";
import { sessionFormSchema, sanitizeSessionFormData, MIN_SESSION_PRICE } from "@/lib/session-validation";
import { withTimeout } from "@/lib/network-timeout";

interface EditGroupSessionDialogProps {
  session: {
    id: string;
    session_name: string;
    session_type: string;
    max_participants: number;
    min_participants: number;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    price_per_person: number;
    location: string;
    description?: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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


export function EditGroupSessionDialog({ session, open, onOpenChange }: EditGroupSessionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<GroupSessionFormData>(initialFormData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (session) {
      setFormData({
        session_name: session.session_name,
        session_type: session.session_type,
        max_participants: session.max_participants,
        min_participants: session.min_participants,
        scheduled_date: session.scheduled_date,
        start_time: session.start_time,
        end_time: session.end_time,
        price_per_person: session.price_per_person,
        location: session.location,
        description: session.description || ""
      });
      setFieldErrors({});
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    
    setIsSubmitting(true);
    setFieldErrors({});

    try {
      // Sanitize and validate form data with Zod
      const sanitizedData = sanitizeSessionFormData(formData);
      const validationResult = sessionFormSchema.safeParse(sanitizedData);
      
      if (!validationResult.success) {
        // Collect all field errors
        const zodErrors = validationResult.error.issues;
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

      await api.patch(`/group-sessions/${session.id}`, {
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
        title: "Séance modifiée !",
        description: "La séance de groupe a été mise à jour avec succès",
      });

      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Erreur modification séance:", error);
      toast({
        title: "Erreur",
        description: (error instanceof Error ? error.message : "") || "Une erreur est survenue lors de la modification",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setFieldErrors({});
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la séance de groupe</DialogTitle>
          <DialogDescription>
            Modifiez les détails de votre séance
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
              {isSubmitting ? "Modification..." : "Modifier la séance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
