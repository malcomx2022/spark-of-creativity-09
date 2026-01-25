import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2, Info } from 'lucide-react';
import { useCreateConsultationReport } from '@/hooks/useConsultationReports';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ConsultationReportFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitionerId: string;
  appointmentId: string;
  appointmentDate: string;
  patientName: string;
  onSuccess?: () => void;
}

export const ConsultationReportFormDialog = ({
  open,
  onOpenChange,
  practitionerId,
  appointmentId,
  appointmentDate,
  patientName,
  onSuccess,
}: ConsultationReportFormDialogProps) => {
  const createReport = useCreateConsultationReport();

  const [consultationType, setConsultationType] = useState<string>('');
  const [severityLevel, setSeverityLevel] = useState<string>('');
  const [consultationReason, setConsultationReason] = useState('');
  const [clinicalFindings, setClinicalFindings] = useState('');
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState('');
  const [treatmentPrescription, setTreatmentPrescription] = useState('');
  const [followUpTimeframe, setFollowUpTimeframe] = useState<string>('');
  const [followUpRecommendation, setFollowUpRecommendation] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [shareWithDoctor, setShareWithDoctor] = useState(false);

  const isValid = consultationType && severityLevel && consultationReason && 
                  clinicalFindings && primaryDiagnosis && treatmentPrescription && 
                  followUpTimeframe;

  const handleSubmit = async () => {
    if (!isValid) {
      toast({
        title: 'Champs requis manquants',
        description: 'Veuillez remplir tous les champs obligatoires',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createReport.mutateAsync({
        practitioner_id: practitionerId,
        appointment_id: appointmentId,
        consultation_date: new Date().toISOString(),
        consultation_type: consultationType,
        consultation_reason: consultationReason,
        clinical_findings: clinicalFindings,
        primary_diagnosis: primaryDiagnosis,
        treatment_prescription: treatmentPrescription,
        follow_up_timeframe: followUpTimeframe,
        follow_up_recommendation: followUpRecommendation || null,
        additional_comments: additionalComments || null,
        severity_level: severityLevel,
        share_with_doctor: shareWithDoctor,
      });

      toast({
        title: 'Rapport créé avec succès',
        description: 'Le rapport de consultation a été enregistré',
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Erreur lors de la création du rapport:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de créer le rapport de consultation',
        variant: 'destructive',
      });
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'urgent':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'modere':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Modéré</Badge>;
      case 'leger':
        return <Badge variant="outline" className="border-green-500 text-green-700">Léger</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Créer un Rapport de Consultation
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <p>Rapport formel et détaillé pour consultation importante</p>
            <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>
                Pour des notes cliniques rapides, utilisez plutôt l'onglet <strong>Notes de Soin (SOAP)</strong>.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informations générales (lecture seule) */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div>
              <span className="text-sm font-medium">Patient :</span> {patientName}
            </div>
            <div>
              <span className="text-sm font-medium">Date du rendez-vous :</span>{' '}
              {format(new Date(appointmentDate), 'dd MMMM yyyy', { locale: fr })}
            </div>
          </div>

          {/* Type de consultation */}
          <div className="space-y-2">
            <Label htmlFor="consultation-type">Type de consultation *</Label>
            <Select value={consultationType} onValueChange={setConsultationType}>
              <SelectTrigger id="consultation-type">
                <SelectValue placeholder="Sélectionner le type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domicile">Consultation à domicile</SelectItem>
                <SelectItem value="teleconsultation">Téléconsultation</SelectItem>
                <SelectItem value="suivi">Suivi post-consultation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Niveau de gravité */}
          <div className="space-y-2">
            <Label htmlFor="severity-level">Niveau de gravité *</Label>
            <Select value={severityLevel} onValueChange={setSeverityLevel}>
              <SelectTrigger id="severity-level">
                <SelectValue placeholder="Sélectionner le niveau" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leger">
                  <div className="flex items-center gap-2">
                    Léger {getSeverityBadge('leger')}
                  </div>
                </SelectItem>
                <SelectItem value="modere">
                  <div className="flex items-center gap-2">
                    Modéré {getSeverityBadge('modere')}
                  </div>
                </SelectItem>
                <SelectItem value="urgent">
                  <div className="flex items-center gap-2">
                    Urgent {getSeverityBadge('urgent')}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Motif de la consultation */}
          <div className="space-y-2">
            <Label htmlFor="consultation-reason">Motif de la consultation *</Label>
            <Textarea
              id="consultation-reason"
              value={consultationReason}
              onChange={(e) => setConsultationReason(e.target.value)}
              rows={3}
              placeholder="Décrivez le motif de la consultation..."
            />
          </div>

          {/* Constats cliniques */}
          <div className="space-y-2">
            <Label htmlFor="clinical-findings">Constats cliniques / Signes observés *</Label>
            <Textarea
              id="clinical-findings"
              value={clinicalFindings}
              onChange={(e) => setClinicalFindings(e.target.value)}
              rows={4}
              placeholder="Décrivez les signes cliniques observés..."
            />
          </div>

          {/* Diagnostic principal */}
          <div className="space-y-2">
            <Label htmlFor="primary-diagnosis">Diagnostic principal *</Label>
            <Textarea
              id="primary-diagnosis"
              value={primaryDiagnosis}
              onChange={(e) => setPrimaryDiagnosis(e.target.value)}
              rows={3}
              placeholder="Indiquez le diagnostic principal..."
            />
          </div>

          {/* Traitement prescrit */}
          <div className="space-y-2">
            <Label htmlFor="treatment">Traitement / Prescription proposée *</Label>
            <Textarea
              id="treatment"
              value={treatmentPrescription}
              onChange={(e) => setTreatmentPrescription(e.target.value)}
              rows={4}
              placeholder="Décrivez le traitement prescrit..."
            />
          </div>

          {/* Délai de suivi */}
          <div className="space-y-2">
            <Label htmlFor="follow-up-timeframe">Délai de suivi recommandé *</Label>
            <Select value={followUpTimeframe} onValueChange={setFollowUpTimeframe}>
              <SelectTrigger id="follow-up-timeframe">
                <SelectValue placeholder="Sélectionner le délai" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Dans 24h</SelectItem>
                <SelectItem value="3-7j">Dans 3 à 7 jours</SelectItem>
                <SelectItem value="demande">À la demande du patient</SelectItem>
                <SelectItem value="autre">Autre (voir commentaires)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recommandations de suivi */}
          <div className="space-y-2">
            <Label htmlFor="follow-up">Recommandations de suivi</Label>
            <Textarea
              id="follow-up"
              value={followUpRecommendation}
              onChange={(e) => setFollowUpRecommendation(e.target.value)}
              rows={3}
              placeholder="Indiquez les recommandations de suivi..."
            />
          </div>

          {/* Commentaires complémentaires */}
          <div className="space-y-2">
            <Label htmlFor="comments">Commentaires complémentaires</Label>
            <Textarea
              id="comments"
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              rows={3}
              placeholder="Ajoutez des commentaires si nécessaire..."
            />
          </div>

          {/* Partager avec médecin traitant */}
          {/* ✅ CORRECTION P1-4: Ajouter une note informative sur le partage */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="share-with-doctor">Partager avec le médecin traitant</Label>
              <p className="text-sm text-muted-foreground">
                {shareWithDoctor
                  ? 'Le rapport sera accessible au médecin traitant du patient (si renseigné dans son dossier)'
                  : 'Le rapport restera confidentiel entre vous et le patient'}
              </p>
            </div>
            <Switch
              id="share-with-doctor"
              checked={shareWithDoctor}
              onCheckedChange={setShareWithDoctor}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createReport.isPending}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || createReport.isPending}
            >
              {createReport.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création en cours...
                </>
              ) : (
                'Créer le rapport'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
