import { useState, useEffect } from 'react';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useConversations } from '@/hooks/useConversations';
import { ConversationsList } from '@/components/messaging/ConversationsList';
import { ChatInterface } from '@/components/messaging/ChatInterface';
import type { Conversation } from '@/hooks/useConversations';

export function PractitionerMessagesSection() {
  const { data: user } = useSupabaseUser();
  const { data: conversations = [], isLoading } = useConversations(user?.id, 'practitioner');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();

  // Auto-select first conversation when loaded (only once)
  useEffect(() => {
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Chargement des conversations...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <ConversationsList
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={setSelectedConversation}
          userType="practitioner"
        />
      </div>
      <div className="lg:col-span-2">
        {selectedConversation && user ? (
          <ChatInterface
            conversation={selectedConversation}
            currentUserId={user.id}
            userType="practitioner"
          />
        ) : (
          <div className="flex items-center justify-center h-[calc(100vh-12rem)] border rounded-lg bg-muted/20">
            <p className="text-muted-foreground">
              Sélectionnez une conversation pour commencer
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
