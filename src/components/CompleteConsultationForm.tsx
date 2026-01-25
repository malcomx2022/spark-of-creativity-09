import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, FileText, Pill, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CompleteConsultationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  practitionerId: string;
  patientName: string;
  onCompleted?: () => void;
}

export function CompleteConsultationForm({
  open,
  onOpenChange,
  appointmentId,
  practitionerId,
  patientName,
  onCompleted,
}: CompleteConsultationFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    consultationType: 'domicile',
    consultationReason: '',
    clinicalFindings: '',
    primaryDiagnosis: '',
    treatmentPrescription: '',
    followUpRecommendation: '',
    followUpTimeframe: '',
    additionalComments: '',
    severityLevel: 'moderate',
  });

  const handleSubmit = async () => {
    // Validation
    if (!formData.clinicalFindings || !formData.primaryDiagnosis) {
      toast({
        title: 'Champs requis',
        description: 'Veuillez remplir au moins les observations cliniques et le diagnostic.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Créer le compte-rendu de consultation
      const { error: reportError } = await supabase
        .from('consultation_reports')
        .insert({
          appointment_id: appointmentId,
          practitioner_id: practitionerId,
          consultation_type: formData.consultationType,
          consultation_reason: formData.consultationReason,
          clinical_findings: formData.clinicalFindings,
          primary_diagnosis: formData.primaryDiagnosis,
          treatment_prescription: formData.treatmentPrescription,
          follow_up_recommendation: formData.followUpRecommendation,
          follow_up_timeframe: formData.followUpTimeframe,
          additional_comments: formData.additionalComments,
          severity_level: formData.severityLevel,
          consultation_date: new Date().toISOString(),
        });

      if (reportError) throw reportError;

      // 2. Marquer la consultation comme terminée
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({
          status: 'awaiting_confirmation', // En attente confirmation patient
          internal_notes: 'CONSULTATION_TERMINEE',
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId);

      if (appointmentError) throw appointmentError;

      toast({
        title: '✅ Consultation terminée',
        description: 'Le compte-rendu a été enregistré. Le patient va maintenant confirmer la consultation.',
      });

      onCompleted?.();
      onOpenChange(false);
      
      // Reset form
      setFormData({
        consultationType: 'domicile',
        consultationReason: '',
        clinicalFindings: '',
        primaryDiagnosis: '',
        treatmentPrescription: '',
        followUpRecommendation: '',
        followUpTimeframe: '',
        additionalComments: '',
        severityLevel: 'moderate',
      });
    } catch (error) {
      console.error('Erreur finalisation consultation:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de finaliser la consultation. Réessayez.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clôture de consultation</DialogTitle>
          <DialogDescription>
            Patient : {patientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              Remplissez le compte-rendu de consultation. Le patient recevra une demande de confirmation.
            </AlertDescription>
          </Alert>

          {/* Type de consultation */}
          <div className="space-y-2">
            <Label htmlFor="type">Type de consultation</Label>
            <Select
              value={formData.consultationType}
              onValueChange={(value) => setFormData({ ...formData, consultationType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domicile">À domicile</SelectItem>
                <SelectItem value="video">Téléconsultation</SelectItem>
                <SelectItem value="urgence">Urgence</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Motif */}
          <div className="space-y-2">
            <Label htmlFor="reason">Motif de la consultation</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Douleurs abdominales, fièvre..."
              value={formData.consultationReason}
              onChange={(e) => setFormData({ ...formData, consultationReason: e.target.value })}
              rows={2}
            />
          </div>

          {/* Observations cliniques * */}
          <div className="space-y-2">
            <Label htmlFor="findings" className="flex items-center gap-1">
              Observations cliniques <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="findings"
              placeholder="Décrivez les signes cliniques observés, les examens effectués..."
              value={formData.clinicalFindings}
              onChange={(e) => setFormData({ ...formData, clinicalFindings: e.target.value })}
              rows={4}
              required
            />
          </div>

          {/* Diagnostic principal * */}
          <div className="space-y-2">
            <Label htmlFor="diagnosis" className="flex items-center gap-1">
              Diagnostic principal <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="diagnosis"
              placeholder="Indiquez le diagnostic posé..."
              value={formData.primaryDiagnosis}
              onChange={(e) => setFormData({ ...formData, primaryDiagnosis: e.target.value })}
              rows={2}
              required
            />
          </div>

          {/* Niveau de gravité */}
          <div className="space-y-2">
            <Label htmlFor="severity">Niveau de gravité</Label>
            <Select
              value={formData.severityLevel}
              onValueChange={(value) => setFormData({ ...formData, severityLevel: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Faible</SelectItem>
                <SelectItem value="moderate">Modéré</SelectItem>
                <SelectItem value="high">Élevé</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ordonnance / Traitement */}
          <div className="space-y-2">
            <Label htmlFor="prescription" className="flex items-center gap-1">
              <Pill className="h-4 w-4" />
              Ordonnance / Traitement prescrit
            </Label>
            <Textarea
              id="prescription"
              placeholder="Médicaments prescrits, posologie, durée du traitement..."
              value={formData.treatmentPrescription}
              onChange={(e) => setFormData({ ...formData, treatmentPrescription: e.target.value })}
              rows={4}
            />
          </div>

          {/* Recommandations de suivi */}
          <div className="space-y-2">
            <Label htmlFor="followup">Recommandations de suivi</Label>
            <Textarea
              id="followup"
              placeholder="Conseils pour le patient, précautions à prendre..."
              value={formData.followUpRecommendation}
              onChange={(e) => setFormData({ ...formData, followUpRecommendation: e.target.value })}
              rows={3}
            />
          </div>

          {/* Délai de suivi */}
          <div className="space-y-2">
            <Label htmlFor="timeframe">Délai de suivi recommandé</Label>
            <Input
              id="timeframe"
              placeholder="Ex: 7 jours, 2 semaines..."
              value={formData.followUpTimeframe}
              onChange={(e) => setFormData({ ...formData, followUpTimeframe: e.target.value })}
            />
          </div>

          {/* Commentaires additionnels */}
          <div className="space-y-2">
            <Label htmlFor="comments">Commentaires additionnels</Label>
            <Textarea
              id="comments"
              placeholder="Informations complémentaires..."
              value={formData.additionalComments}
              onChange={(e) => setFormData({ ...formData, additionalComments: e.target.value })}
              rows={2}
            />
          </div>

          <Alert variant="default" className="border-amber-500 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Une fois validé, le patient recevra une demande de confirmation de la consultation.
              Après confirmation (ou auto-confirmation après 24h), les fonds seront disponibles pour retrait.
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              'Enregistrement...'
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Terminer la consultation
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
