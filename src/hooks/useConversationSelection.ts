import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Conversation } from './useConversations';

export function useConversationSelection(conversations: Conversation[], userId?: string) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('appointment');
  const listed = conversations.find(c => c.appointment_id === requested);
  const linked = useQuery({
    queryKey: ['linked-conversation', userId, requested],
    queryFn: () => api.get<Conversation>(`/conversations/${encodeURIComponent(requested!)}`),
    enabled: !!userId && !!requested && !listed,
    retry: false,
  });
  const selectConversation = (conversation: Conversation) => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.set('tab', 'messages');
    next.set('appointment', conversation.appointment_id);
    return next;
  });
  return { selectedConversation: requested ? listed ?? linked.data : conversations[0], selectConversation, requested, linkedError: !!requested && !listed && linked.isError };
}
