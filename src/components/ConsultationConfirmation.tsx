import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { api, auth, errorMessage } from '@/lib/api';

interface ConsultationConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  practitionerName: string;
  onConfirmed?: () => void;
}

export function ConsultationConfirmation({
  open,
  onOpenChange,
  appointmentId,
  practitionerName,
  onConfirmed,
}: ConsultationConfirmationProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [issueDescription, setIssueDescription] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);

    try {
      // Confirmation par le patient → completed (patient_confirmed_at posé par l'API)
      await api.post(`/appointments/${appointmentId}/confirm`);

      toast({
        title: '✅ Consultation confirmée',
        description: 'Merci d\'avoir confirmé. Le praticien sera crédité sous peu.',
      });

      onConfirmed?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Erreur confirmation:', error);
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de confirmer la consultation. Réessayez.'),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReportIssue = async () => {
    if (!issueDescription.trim()) {
      toast({
        title: 'Description requise',
        description: 'Veuillez décrire le problème rencontré.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      if (!auth.getUser()) throw new Error('Utilisateur non connecté');

      // Créer un litige (l'API notifie les administrateurs)
      await api.post('/disputes', {
        appointmentId,
        subject: `Problème avec la consultation - ${practitionerName}`,
        description: issueDescription,
        priority: 'high',
      });

      toast({
        title: '📝 Problème signalé',
        description: 'Notre équipe va examiner votre demande rapidement.',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Erreur signalement:', error);
      toast({
        title: 'Erreur',
        description: errorMessage(error, 'Impossible de signaler le problème. Réessayez.'),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmation de consultation</DialogTitle>
          <DialogDescription>
            Votre consultation avec {practitionerName} s'est-elle bien déroulée ?
          </DialogDescription>
        </DialogHeader>

        {!showIssueForm ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription className="text-sm">
                En confirmant, vous permettez le versement des fonds au praticien.
                Si la consultation n'a pas eu lieu ou s'est mal passée, signalez-le.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleConfirm}
                disabled={isProcessing}
                className="w-full"
                size="lg"
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Oui, tout s'est bien passé
              </Button>

              <Button
                onClick={() => setShowIssueForm(true)}
                disabled={isProcessing}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                <XCircle className="mr-2 h-5 w-5" />
                Non, j'ai un problème à signaler
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Si vous ne répondez pas sous 24h, la consultation sera automatiquement confirmée.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Décrivez le problème rencontré. Notre équipe examinera votre demande.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="issue">Description du problème *</Label>
              <Textarea
                id="issue"
                placeholder="Que s'est-il passé ? (consultation non effectuée, comportement inapproprié, etc.)"
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowIssueForm(false)}
                disabled={isProcessing}
                variant="outline"
                className="flex-1"
              >
                Retour
              </Button>
              <Button
                onClick={handleReportIssue}
                disabled={isProcessing}
                variant="destructive"
                className="flex-1"
              >
                Signaler le problème
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
