import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';
import { useMessages, useSendMessage, useMarkMessageAsRead } from '@/hooks/useMessages';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export function PractitionerMessagesSection() {
  const { data: user } = useSupabaseUser();
  const { data: messages = [] } = useMessages(user?.id, 'practitioner');
  const sendMessage = useSendMessage();
  const markAsRead = useMarkMessageAsRead();
  const [newMessage, setNewMessage] = useState('');

  const handleSendMessage = async () => {
    if (!user?.id || !newMessage.trim()) return;

    try {
      await sendMessage.mutateAsync({
        sender_id: user.id,
        content: newMessage,
        appointment_id: '',
      });
      setNewMessage('');
      toast({
        title: 'Message envoyé',
        description: 'Votre message a été envoyé avec succès.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'envoyer le message.',
        variant: 'destructive',
      });
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    try {
      await markAsRead.mutateAsync(messageId);
    } catch (error) {
      console.error('Erreur lors du marquage du message comme lu', error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Messagerie patients
          </CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-muted-foreground mb-4">Aucun message</p>
          ) : (
            <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  onClick={() => message.is_read === false && handleMarkAsRead(message.id)}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                    message.is_read === false ? 'bg-primary/5 border-primary/20' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-medium">
                      {message.sender_id === user?.id ? 'Vous' : 'Patient'}
                    </p>
                    {message.is_read === false && <Badge variant="default">Nouveau</Badge>}
                  </div>
                  <p className="text-sm">{message.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(message.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <Textarea
              placeholder="Écrivez votre message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={3}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sendMessage.isPending}
              className="w-full"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMessage.isPending ? 'Envoi...' : 'Envoyer'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
