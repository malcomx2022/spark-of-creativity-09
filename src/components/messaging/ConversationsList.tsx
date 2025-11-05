import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Calendar } from 'lucide-react';
import { type Conversation } from '@/hooks/useConversations';
import { Button } from '@/components/ui/button';

interface ConversationsListProps {
  conversations: Conversation[];
  selectedConversation?: Conversation;
  onSelectConversation: (conversation: Conversation) => void;
  userType: 'patient' | 'practitioner';
}

export function ConversationsList({
  conversations,
  selectedConversation,
  onSelectConversation,
  userType,
}: ConversationsListProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'À l\'instant';
    } else if (diffInHours < 24) {
      return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (diffInHours < 48) {
      return 'Hier';
    }
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const truncateMessage = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  if (conversations.length === 0) {
    return (
      <Card className="h-[calc(100vh-12rem)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Conversations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Aucune conversation pour le moment
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Les conversations apparaîtront après vos rendez-vous
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[calc(100vh-12rem)]">
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Conversations
          {conversations.some(c => c.unread_count > 0) && (
            <Badge variant="destructive" className="ml-auto">
              {conversations.reduce((sum, c) => sum + c.unread_count, 0)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-16rem)]">
          <div className="divide-y">
            {conversations.map((conversation) => {
              const otherUserName = userType === 'patient' 
                ? conversation.practitioner_name 
                : conversation.patient_name;
              
              const isSelected = selectedConversation?.appointment_id === conversation.appointment_id;

              return (
                <Button
                  key={conversation.appointment_id}
                  variant="ghost"
                  className={`w-full justify-start p-4 h-auto hover:bg-muted/50 transition-colors ${
                    isSelected ? 'bg-muted' : ''
                  } ${conversation.unread_count > 0 ? 'bg-primary/5' : ''}`}
                  onClick={() => onSelectConversation(conversation)}
                >
                  <div className="flex items-start gap-3 w-full">
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(otherUserName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-sm truncate">
                          {otherUserName}
                        </p>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {formatDate(conversation.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(conversation.appointment_date).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${
                          conversation.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                        }`}>
                          {truncateMessage(conversation.last_message)}
                        </p>
                        {conversation.unread_count > 0 && (
                          <Badge variant="default" className="ml-2 flex-shrink-0">
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
