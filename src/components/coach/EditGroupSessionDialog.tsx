import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { GroupSessionForm, GroupSessionFormData } from "./GroupSessionForm";
import { validateSessionForm, MIN_SESSION_PRICE } from "@/lib/session-validation";

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
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    
    setIsSubmitting(true);

    try {
      // Validate form
      const validationError = validateSessionForm(formData);
      if (validationError) {
        toast({
          title: validationError.title,
          description: validationError.description,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      const { error } = await supabase
        .from("group_sessions")
        .update(formData)
        .eq('id', session.id);

      if (error) throw error;

      toast({
        title: "Séance modifiée !",
        description: "La séance de groupe a été mise à jour avec succès",
      });

      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la séance de groupe</DialogTitle>
          <DialogDescription>
            Modifiez les détails de votre séance
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <GroupSessionForm formData={formData} onChange={setFormData} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
