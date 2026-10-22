import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Send,
  Calendar,
  MessageSquare,
  CheckCheck,
  Check,
  Paperclip,
  X,
  FileText,
  Download
} from 'lucide-react';
import {
  useConversationMessages,
  useSendMessage,
  useMarkMessagesAsRead,
  useTypingIndicator,
  type Conversation
} from '@/hooks/useConversations';

// Traductions des statuts
const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

interface ChatInterfaceProps {
  conversation: Conversation;
  currentUserId: string;
  userType: 'patient' | 'practitioner';
}

export function ChatInterface({ conversation, currentUserId, userType }: ChatInterfaceProps) {
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const { data: messages = [], isLoading: isLoadingMessages } = useConversationMessages(conversation.appointment_id, currentUserId);
  const sendMessage = useSendMessage();
  // `mutate` est stable (TanStack Query) : seul le nombre de non-lus redéclenche le marquage.
  const { mutate: markAsRead } = useMarkMessagesAsRead();
  const { isOtherUserTyping, setTyping } = useTypingIndicator(conversation.appointment_id, currentUserId);

  const otherUserName = userType === 'patient' 
    ? conversation.practitioner_name 
    : conversation.patient_name;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages as read when conversation is opened (and when unread messages arrive while it is open)
  useEffect(() => {
    if (conversation.unread_count > 0) {
      markAsRead({
        appointment_id: conversation.appointment_id,
        user_id: currentUserId,
      });
    }
  }, [conversation.appointment_id, conversation.unread_count, currentUserId, markAsRead]);

  const handleSendMessage = async () => {
    if (!message.trim() && !attachment) return;

    try {
      await sendMessage.mutateAsync({
        sender_id: currentUserId,
        content: message.trim() || '📎 Pièce jointe',
        appointment_id: conversation.appointment_id,
        attachment: attachment || undefined,
      });
      setMessage('');
      setAttachment(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'envoyer le message',
        variant: 'destructive',
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Fichier trop volumineux',
        description: 'La taille maximale est de 5 Mo',
        variant: 'destructive',
      });
      return;
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Type de fichier non supporté',
        description: 'Seuls les images (JPEG, PNG, GIF, WebP) et les PDF sont acceptés',
        variant: 'destructive',
      });
      return;
    }

    setAttachment(file);
  };

  const removeAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Set typing indicator
    setTyping(true);
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
      setTyping(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-500/10 text-yellow-600',
      confirmed: 'bg-blue-500/10 text-blue-600',
      completed: 'bg-green-500/10 text-green-600',
      cancelled: 'bg-red-500/10 text-red-600',
    };
    return colors[status as keyof typeof colors] || 'bg-muted text-muted-foreground';
  };

  return (
    <Card className="flex flex-col h-[calc(100dvh-12rem)] min-h-64">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(otherUserName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{otherUserName}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{new Date(conversation.appointment_date).toLocaleDateString('fr-FR')}</span>
                <Badge
                  variant="outline"
                  className={getStatusColor(conversation.appointment_status)}
                >
                  {STATUS_LABELS[conversation.appointment_status] || conversation.appointment_status}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {isLoadingMessages ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={`flex items-end gap-2 ${i % 2 === 0 ? 'flex-row-reverse' : 'flex-row'}`}>
                    {i % 2 !== 0 && <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />}
                    <div className={`max-w-[70%] ${i % 2 === 0 ? 'ml-auto' : ''}`}>
                      <Skeleton className={`h-16 w-48 rounded-2xl ${i % 2 === 0 ? 'rounded-br-sm' : 'rounded-bl-sm'}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Aucun message. Commencez la conversation !
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${
                      isOwn ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {!isOwn && (
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="bg-muted text-xs">
                          {getInitials(otherUserName)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted rounded-bl-sm'
                      }`}
                    >
                      {msg.attachment_url && (
                        <div className="mb-2">
                          {msg.attachment_type?.startsWith('image/') ? (
                            <img 
                              src={msg.attachment_url} 
                              alt={msg.attachment_name || 'Image'}
                              className="max-w-full rounded-lg max-h-64 object-cover cursor-pointer"
                              onClick={() => window.open(msg.attachment_url!, '_blank')}
                            />
                          ) : (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2 p-2 rounded-lg ${
                                isOwn ? 'bg-primary-foreground/10' : 'bg-background'
                              }`}
                            >
                              <FileText className="h-5 w-5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {msg.attachment_name}
                                </p>
                                {msg.attachment_size && (
                                  <p className="text-xs opacity-70">
                                    {formatFileSize(msg.attachment_size)}
                                  </p>
                                )}
                              </div>
                              <Download className="h-4 w-4 flex-shrink-0" />
                            </a>
                          )}
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                      <div
                        className={`flex items-center gap-1 mt-1 text-xs ${
                          isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}
                      >
                        <span>{formatTime(msg.created_at)}</span>
                        {isOwn && (
                          msg.is_read ? (
                            <CheckCheck className="h-3 w-3" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {isOtherUserTyping && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback className="bg-muted text-xs">
                    {getInitials(otherUserName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded-2xl rounded-bl-sm">
                  <span className="animate-pulse">En train d'écrire</span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4 bg-background">
          {attachment && (
            <div className="mb-3 p-2 bg-muted rounded-lg flex items-center gap-2">
              {attachment.type.startsWith('image/') ? (
                <img 
                  src={URL.createObjectURL(attachment)} 
                  alt="Preview" 
                  className="h-16 w-16 object-cover rounded"
                />
              ) : (
                <FileText className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={removeAttachment}
                className="h-8 w-8 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={sendMessage.isPending}
              className="h-10 w-10 flex-shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              placeholder="Écrivez votre message..."
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyPress}
              rows={1}
              className="resize-none min-h-[40px] max-h-[120px]"
            />
            <Button
              onClick={handleSendMessage}
              disabled={(!message.trim() && !attachment) || sendMessage.isPending}
              size="icon"
              className="h-10 w-10 flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Appuyez sur Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne • Max 5 Mo
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
