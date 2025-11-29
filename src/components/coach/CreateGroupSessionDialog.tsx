import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { GroupSessionForm, GroupSessionFormData } from "./GroupSessionForm";
import { validateSessionForm, MIN_SESSION_PRICE } from "@/lib/session-validation";

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

export function CreateGroupSessionDialog({ coachId }: CreateGroupSessionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<GroupSessionFormData>(initialFormData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        .insert({
          coach_id: coachId,
          ...formData
        });

      if (error) throw error;

      toast({
        title: "Séance créée !",
        description: "La séance de groupe a été créée avec succès",
      });

      queryClient.invalidateQueries({ queryKey: ['group-sessions'] });
      
      setOpen(false);
      setFormData(initialFormData);
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
    <Dialog open={open} onOpenChange={setOpen}>
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
          <GroupSessionForm formData={formData} onChange={setFormData} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
