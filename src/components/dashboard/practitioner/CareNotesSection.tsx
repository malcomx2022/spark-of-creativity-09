import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FileText, Share2, HelpCircle, Info, Eye, Download } from "lucide-react";
import { CareNoteDetailDialog } from '../CareNoteDetailDialog';
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePractitionerAppointments } from '@/hooks/useAppointments';
import { useCareNoteByAppointment, useCreateCareNote, useUpdateCareNote, useCareNotes, type CareNoteWithAppointment } from '@/hooks/useCareNotes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { CareNotesConfirmDialog } from './CareNotesConfirmDialog';

export default function CareNotesSection() {
  const { data: user } = useSupabaseUser();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [shareWithPatient, setShareWithPatient] = useState(false);
  const [notesLimit, setNotesLimit] = useState(10);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedNoteForDetail, setSelectedNoteForDetail] = useState<any>(null);
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

  // Utiliser l'ID du praticien (conversion en string pour correspondre au format text de la table appointments)
  const practitionerIdStr = practitioner?.id;
  
  const { data: appointmentsResult, isLoading: appointmentsLoading } = usePractitionerAppointments(practitionerIdStr, 0, 100);
  const appointments = appointmentsResult?.data || [];
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  
  // Debug: Log pour vérifier les données
  console.log('CareNotesSection - practitioner:', practitioner?.id, 'appointments:', appointments.length, 'completed:', completedAppointments.length);

  const { data: currentNote } = useCareNoteByAppointment(selectedAppointmentId || undefined);
  const { data: allNotes = [] } = useCareNotes(practitioner?.id);

  const handleViewNoteDetail = (note: CareNoteWithAppointment) => {
    setSelectedNoteForDetail(note);
    setShowDetailDialog(true);
  };
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

    setShowConfirmDialog(true);
  };
  
  const confirmShare = async () => {
    if (!selectedAppointmentId || !practitioner?.id || !user?.id) return;

    setShowConfirmDialog(false);

    try {
      // ✅ CORRECTION P1-2: Vérifier que le RDV appartient bien au praticien connecté
      const appointment = completedAppointments.find((apt) => apt.id === selectedAppointmentId);

      if (!appointment) {
        toast({
          title: 'Erreur',
          description: 'Rendez-vous introuvable.',
          variant: 'destructive',
        });
        return;
      }

      // Vérification d'autorisation : le praticien doit être celui du RDV
      if (appointment.practitionerId && appointment.practitionerId !== practitioner.id) {
        toast({
          title: 'Non autorisé',
          description: 'Vous ne pouvez partager que les notes de vos propres consultations.',
          variant: 'destructive',
        });
        return;
      }

      // ✅ CORRECTION P1-1: Persister la note AVANT de mettre à jour l'état local
      const note = await persistNote(true);

      // Notifications non-bloquantes (on continue même si elles échouent)
      let notificationSuccess = true;
      if (appointment?.patientId) {
        try {
          const { error: notificationError } = await supabase.from('notifications').insert({
            user_id: appointment.patientId,
            title: 'Nouvelle note de soin',
            message: `Votre praticien ${practitioner?.name ?? ''} a partagé une note de soin pour votre rendez-vous du ${new Date(appointment.date).toLocaleDateString('fr-FR')}.`,
            link: `/patient/appointments/${appointment.id}`,
            type: 'care_note',
          });

          if (notificationError) {
            console.warn('Erreur notification (non bloquant):', notificationError);
            notificationSuccess = false;
          }

          const { error: messageError } = await supabase.from('messages').insert({
            appointment_id: appointment.id,
            sender_id: user.id,
            content: 'Une nouvelle note de soin est disponible dans votre dossier patient.',
          });

          if (messageError) {
            console.warn('Erreur message (non bloquant):', messageError);
            notificationSuccess = false;
          }
        } catch (notifError) {
          console.warn('Erreur lors des notifications (non bloquant):', notifError);
          notificationSuccess = false;
        }
      }

      // ✅ CORRECTION P1-1: Mettre à jour l'état APRÈS succès de persistNote
      setShareWithPatient(true);
      queryClient.invalidateQueries({ queryKey: ['care-note', 'appointment', selectedAppointmentId] });

      toast({
        title: 'Note partagée',
        description: notificationSuccess
          ? 'Le patient a été notifié de la note de soin.'
          : 'La note a été partagée, mais la notification n\'a pas pu être envoyée.',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erreur lors du partage',
        description: 'Impossible de partager la note pour le moment.',
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
          {appointmentsLoading ? (
              <p className="text-muted-foreground text-center py-4">
                Chargement des consultations...
              </p>
            ) : completedAppointments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Aucune consultation terminée ({appointments.length} rendez-vous au total)
              </p>
            ) : (
              completedAppointments.slice(0, notesLimit).map((apt) => (
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
            {completedAppointments.length > notesLimit && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setNotesLimit(prev => prev + 10)}
              >
                Voir plus ({completedAppointments.length - notesLimit} consultations restantes)
              </Button>
            )}
            {completedAppointments.length > 0 && (
              <p className="text-sm text-center text-muted-foreground">
                Affichage {Math.min(notesLimit, completedAppointments.length)} sur {completedAppointments.length} consultations
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Formulaire SOAP */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                <div className="flex items-center gap-2">
                  Note de soin (Format SOAP)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs" side="right">
                        <div className="space-y-2">
                          <p className="font-semibold">Quand utiliser les Notes SOAP ?</p>
                          <ul className="list-disc list-inside space-y-1 text-sm">
                            <li>Suivis rapides et consultations de routine</li>
                            <li>Notes cliniques quotidiennes</li>
                            <li>Documentation structurée mais concise</li>
                            <li>Partage rapide avec le patient</li>
                          </ul>
                          <div className="mt-3 p-2 bg-muted rounded text-xs">
                            <p className="font-semibold mb-1">Format SOAP :</p>
                            <p><strong>S</strong>ubjectif : Plaintes du patient</p>
                            <p><strong>O</strong>bjectif : Observations cliniques</p>
                            <p><strong>A</strong>nalyse : Diagnostic/Évaluation</p>
                            <p><strong>P</strong>lan : Traitement/Recommandations</p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardTitle>
              <CardDescription>Notes cliniques rapides au format SOAP • Subjectif, Objectif, Analyse, Plan</CardDescription>
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
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Notes SOAP</strong> : Pour suivis rapides et notes cliniques quotidiennes.
              Utilisez <strong>Rapports de Consultation</strong> pour documentations formelles (onglet séparé).
            </AlertDescription>
          </Alert>
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

      {/* Liste des notes existantes */}
      {allNotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Notes de soin enregistrées
            </CardTitle>
            <CardDescription>
              Cliquez sur une note pour voir les détails et la télécharger
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allNotes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleViewNoteDetail(note)}
                >
                  <div className="flex-1">
                    <p className="font-medium">{note.appointments?.patient_name || 'Patient'}</p>
                    <p className="text-sm text-muted-foreground">
                      {note.appointments?.date && format(new Date(note.appointments.date), 'PPP', { locale: fr })}
                      {note.appointments?.specialty && ` • ${note.appointments.specialty}`}
                    </p>
                    {note.assessment && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        Analyse: {note.assessment}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {note.shared_with_patient && (
                      <Badge variant="secondary">Partagé</Badge>
                    )}
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CareNotesConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={confirmShare}
        patientName={
          completedAppointments.find((apt) => apt.id === selectedAppointmentId)?.patientName || ''
        }
        appointmentDate={
          selectedAppointmentId
            ? new Date(
                completedAppointments.find((apt) => apt.id === selectedAppointmentId)?.date || ''
              ).toLocaleDateString('fr-FR')
            : ''
        }
      />

      <CareNoteDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        note={selectedNoteForDetail}
        userType="practitioner"
      />
    </div>
  );
}