import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Phone, MessageSquare, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useSendMessage } from '@/hooks/useConversations';
import type { Appointment } from '@/types/appointment';

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment;
  userId: string;
}

export function ContactDialog({ open, onOpenChange, appointment, userId }: ContactDialogProps) {
  const [message, setMessage] = useState('');
  const sendMessage = useSendMessage();

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      await sendMessage.mutateAsync({
        sender_id: userId,
        content: message,
        appointment_id: appointment.id,
      });
      setMessage('');
      toast({
        title: 'Message envoyé',
        description: 'Votre message a été envoyé au praticien.',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'envoyer le message.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>Contacter {appointment.practitionerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 border rounded-lg space-y-2">
            <p className="text-sm font-medium">Informations du rendez-vous</p>
            <p className="text-sm text-muted-foreground">
              Date : {new Date(appointment.date).toLocaleDateString('fr-FR')} à {appointment.time}
            </p>
            <p className="text-sm text-muted-foreground">
              Spécialité : {appointment.specialty}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              placeholder="Écrivez votre message au praticien..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSendMessage}
              disabled={!message.trim() || sendMessage.isPending}
              className="flex-1"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMessage.isPending ? 'Envoi...' : 'Envoyer le message'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Le praticien sera notifié de votre message et vous répondra dans les plus brefs délais.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
