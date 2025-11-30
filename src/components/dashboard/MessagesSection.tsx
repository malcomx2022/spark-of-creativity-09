import { useState, useEffect, useRef } from 'react';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useConversations } from '@/hooks/useConversations';
import { ConversationsList } from '@/components/messaging/ConversationsList';
import { ChatInterface } from '@/components/messaging/ChatInterface';
import type { Conversation } from '@/hooks/useConversations';

export function MessagesSection() {
  const { data: user } = useSupabaseUser();
  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useConversations(user?.id, 'patient');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const hasAutoSelected = useRef(false);

  // Aplatir les pages de conversations
  const conversations = data?.pages.flatMap(page => page.conversations) || [];

  // Auto-select first conversation when loaded (only once)
  useEffect(() => {
    if (!hasAutoSelected.current && !selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
      hasAutoSelected.current = true;
    }
  }, [conversations, selectedConversation]);

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
          userType="patient"
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
        />
      </div>
      <div className="lg:col-span-2">
        {selectedConversation && user ? (
          <ChatInterface
            conversation={selectedConversation}
            currentUserId={user.id}
            userType="patient"
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
