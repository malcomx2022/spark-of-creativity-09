import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageSquare, Calendar, Loader2 } from 'lucide-react';
import { type Conversation } from '@/hooks/useConversations';
import { Button } from '@/components/ui/button';

interface ConversationsListProps {
  conversations: Conversation[];
  selectedConversation?: Conversation;
  onSelectConversation: (conversation: Conversation) => void;
  userType: 'patient' | 'practitioner';
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  searchQuery?: string;
}

// Traductions des statuts
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

export function ConversationsList({
  conversations,
  selectedConversation,
  onSelectConversation,
  userType,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  searchQuery,
}: ConversationsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Infinite scroll : détecter quand on atteint le bas
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || !hasNextPage || isFetchingNextPage) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;

      // Si on est à 100px du bas, charger plus
      if (scrollHeight - scrollTop - clientHeight < 100) {
        fetchNextPage?.();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
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
      <Card className="h-[calc(100vh-20rem)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Conversations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            {searchQuery ? (
              <>
                <p className="text-muted-foreground">
                  Aucune conversation trouvée
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Essayez avec d'autres termes de recherche
                </p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Aucune conversation pour le moment
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Les conversations apparaîtront après vos rendez-vous
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[calc(100vh-20rem)]">
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Conversations
          <Badge variant="secondary" className="ml-2">
            {conversations.length}
          </Badge>
          {conversations.some(c => c.unread_count > 0) && (
            <Badge variant="destructive" className="ml-auto">
              {conversations.reduce((sum, c) => sum + c.unread_count, 0)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-24rem)]" ref={scrollRef}>
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className={`text-sm truncate max-w-[180px] cursor-help ${
                                conversation.unread_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                              }`}>
                                {truncateMessage(conversation.last_message)}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[300px]">
                              <p className="whitespace-pre-wrap">{conversation.last_message}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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

            {/* Indicateur de chargement en bas */}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Chargement...
                </span>
              </div>
            )}

            {/* Message si plus de conversations */}
            {!hasNextPage && conversations.length > 0 && (
              <div className="text-center p-4 text-sm text-muted-foreground">
                Toutes les conversations chargées
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
