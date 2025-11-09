import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FileText, Share2 } from "lucide-react";
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePractitionerAppointments } from '@/hooks/useAppointments';
import { useCareNoteByAppointment, useCreateCareNote, useUpdateCareNote } from '@/hooks/useCareNotes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export default function CareNotesSection() {
  const { data: user } = useSupabaseUser();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [shareWithPatient, setShareWithPatient] = useState(false);
  const [formData, setFormData] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  });

  const { data: practitioner } = useQuery({
    queryKey: ['practitioner', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('practitioners')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: appointments = [] } = usePractitionerAppointments(practitioner?.id);
  const completedAppointments = appointments.filter(a => a.status === 'completed');

  const { data: currentNote } = useCareNoteByAppointment(selectedAppointmentId || undefined);
  const createNote = useCreateCareNote();
  const updateNote = useUpdateCareNote();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!selectedAppointmentId) {
      setFormData({ subjective: '', objective: '', assessment: '', plan: '' });
      setShareWithPatient(false);
      return;
    }

    if (currentNote) {
      setFormData({
        subjective: currentNote.subjective || '',
        objective: currentNote.objective || '',
        assessment: currentNote.assessment || '',
        plan: currentNote.plan || '',
      });
      setShareWithPatient(currentNote.shared_with_patient || false);
    } else {
      setFormData({ subjective: '', objective: '', assessment: '', plan: '' });
      setShareWithPatient(false);
    }
  }, [currentNote, selectedAppointmentId]);

  const handleSelectAppointment = (appointmentId: string) => {
    setSelectedAppointmentId(appointmentId);
  };

  const persistNote = async (forceShare = shareWithPatient) => {
    if (!selectedAppointmentId || !practitioner?.id) {
      throw new Error('Aucun rendez-vous sélectionné');
    }

    const payload = {
      subjective: formData.subjective || null,
      objective: formData.objective || null,
      assessment: formData.assessment || null,
      plan: formData.plan || null,
      shared_with_patient: forceShare,
    };

    if (currentNote) {
      return updateNote.mutateAsync({
        id: currentNote.id,
        data: payload,
      });
    }

    return createNote.mutateAsync({
      practitioner_id: practitioner.id,
      appointment_id: selectedAppointmentId,
      ...payload,
    });
  };

  const handleSave = async () => {
    if (!selectedAppointmentId || !practitioner?.id) return;

    try {
      await persistNote();
      toast({
        title: 'Note sauvegardée',
        description: 'La note de soin a été enregistrée avec succès.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de sauvegarder la note.',
        variant: 'destructive',
      });
    }
  };

  const handleShare = async () => {
    if (!selectedAppointmentId || !practitioner?.id || !user?.id) {
      toast({
        title: 'Partage impossible',
        description: 'Veuillez sélectionner une consultation et vérifier votre session.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const note = await persistNote(true);
      setShareWithPatient(true);
      queryClient.invalidateQueries({ queryKey: ['care-note', 'appointment', selectedAppointmentId] });

      const appointment = completedAppointments.find((apt) => apt.id === selectedAppointmentId);

      if (appointment?.patientId) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: appointment.patientId,
          title: 'Nouvelle note de soin',
          message: `Votre praticien ${practitioner?.name ?? ''} a partagé une note de soin pour votre rendez-vous du ${new Date(appointment.date).toLocaleDateString('fr-FR')}.`,
          link: `/patient/appointments/${appointment.id}`,
          type: 'care_note',
        });

        if (notificationError) {
          throw notificationError;
        }

        const { error: messageError } = await supabase.from('messages').insert({
          appointment_id: appointment.id,
          sender_id: user.id,
          content: 'Une nouvelle note de soin est disponible dans votre dossier patient.',
        });

        if (messageError) {
          throw messageError;
        }
      }

      toast({
        title: 'Note partagée',
        description: note?.shared_with_patient
          ? 'Le patient a été notifié de la note de soin.'
          : 'Le partage a été enregistré.',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erreur lors du partage',
        description: 'Impossible de notifier le patient pour le moment.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Liste des RDV avec notes */}
      <Card>
        <CardHeader>
          <CardTitle>Rendez-vous récents</CardTitle>
          <CardDescription>Gérez les notes de soin pour chaque visite</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {completedAppointments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Aucune consultation terminée
              </p>
            ) : (
              completedAppointments.slice(0, 10).map((apt) => (
                <div
                  key={apt.id}
                  className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedAppointmentId === apt.id ? 'bg-primary/5 border-primary' : ''
                  }`}
                  onClick={() => handleSelectAppointment(apt.id)}
                >
                  <div>
                    <p className="font-medium">{apt.patientName}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(apt.date).toLocaleDateString('fr-FR')} • {apt.specialty}
                    </p>
                  </div>
                  <Badge variant={currentNote ? 'default' : 'secondary'}>
                    {currentNote ? 'Note complétée' : 'Sans note'}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Formulaire SOAP */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Note de soin (Format SOAP)</CardTitle>
              <CardDescription>Subjectif, Objectif, Analyse, Plan</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="share">Partager avec le patient</Label>
              <Switch
                id="share"
                checked={shareWithPatient}
                onCheckedChange={setShareWithPatient}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedAppointmentId ? (
            <div className="text-center py-8 text-muted-foreground">
              Sélectionnez une consultation pour créer ou modifier une note
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="subjective">Subjectif (S)</Label>
                <Textarea
                  id="subjective"
                  placeholder="Plaintes du patient, symptômes rapportés..."
                  rows={3}
                  value={formData.subjective}
                  onChange={(e) => setFormData({ ...formData, subjective: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="objective">Objectif (O)</Label>
                <Textarea
                  id="objective"
                  placeholder="Observations cliniques, mesures, examens..."
                  rows={3}
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="assessment">Analyse (A)</Label>
                <Textarea
                  id="assessment"
                  placeholder="Diagnostic, évaluation de la situation..."
                  rows={3}
                  value={formData.assessment}
                  onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="plan">Plan (P)</Label>
                <Textarea
                  id="plan"
                  placeholder="Plan de traitement, recommandations, suivi..."
                  rows={3}
                  value={formData.plan}
                  onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={createNote.isPending || updateNote.isPending}
                >
                  {createNote.isPending || updateNote.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
                {shareWithPatient && (
                  <Button
                    variant="outline"
                    onClick={handleShare}
                    disabled={createNote.isPending || updateNote.isPending}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Partager
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}