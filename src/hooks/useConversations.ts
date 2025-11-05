import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { toast } from '@/hooks/use-toast';

export interface Conversation {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  practitioner_id: string;
  practitioner_name: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  appointment_date: string;
  appointment_status: string;
}

export interface Message {
  id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  appointment_id: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
}

// Get all conversations for a user
export function useConversations(userId?: string, userType?: 'patient' | 'practitioner') {
  return useQuery<Conversation[]>({
    queryKey: ['conversations', userId, userType],
    queryFn: async () => {
      if (!userId) return [];
      
      // Get appointments for this user
      const { data: appointments, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .or(
          userType === 'patient' 
            ? `patient_id.eq.${userId}`
            : `practitioner_id.eq.${userId}`
        )
        .order('created_at', { ascending: false });

      if (aptError) throw aptError;
      if (!appointments || appointments.length === 0) return [];

      // Get messages for each appointment
      const conversations: Conversation[] = [];
      
      for (const apt of appointments) {
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('appointment_id', apt.id)
          .order('created_at', { ascending: false });

        const lastMessage = messages?.[0];
        const unreadCount = messages?.filter(
          m => !m.is_read && m.sender_id !== userId
        ).length || 0;

        conversations.push({
          appointment_id: apt.id,
          patient_id: apt.patient_id,
          patient_name: apt.patient_name,
          practitioner_id: apt.practitioner_id,
          practitioner_name: apt.practitioner_name,
          last_message: lastMessage?.content || 'Aucun message',
          last_message_at: lastMessage?.created_at || apt.created_at,
          unread_count: unreadCount,
          appointment_date: apt.date,
          appointment_status: apt.status,
        });
      }

      return conversations.sort((a, b) => 
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
    },
    enabled: !!userId,
  });
}

// Get messages for a specific conversation
export function useConversationMessages(appointmentId?: string, userId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery<Message[]>({
    queryKey: ['messages', appointmentId],
    queryFn: async () => {
      if (!appointmentId) return [];
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('appointment_id', appointmentId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!appointmentId,
  });

  // Set up realtime subscription for new messages
  useEffect(() => {
    if (!appointmentId) return;

    const channel = supabase
      .channel(`messages:${appointmentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `appointment_id=eq.${appointmentId}`,
        },
        (payload) => {
          console.log('New message received:', payload);
          
          // Add new message to cache
          queryClient.setQueryData<Message[]>(
            ['messages', appointmentId],
            (old = []) => [...old, payload.new as Message]
          );

          // Show notification if message is from other user
          const newMessage = payload.new as Message;
          if (newMessage.sender_id !== userId) {
            toast({
              title: 'Nouveau message',
              description: 'Vous avez reçu un nouveau message',
            });
          }

          // Invalidate conversations to update unread count
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `appointment_id=eq.${appointmentId}`,
        },
        (payload) => {
          // Update message in cache
          queryClient.setQueryData<Message[]>(
            ['messages', appointmentId],
            (old = []) =>
              old.map((msg) =>
                msg.id === payload.new.id ? (payload.new as Message) : msg
              )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointmentId, userId, queryClient]);

  return query;
}

// Send a message
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sender_id: string;
      content: string;
      appointment_id: string;
      attachment?: File;
    }) => {
      let attachmentUrl = null;
      let attachmentType = null;
      let attachmentName = null;
      let attachmentSize = null;

      // Upload attachment if present
      if (data.attachment) {
        const fileExt = data.attachment.name.split('.').pop();
        const fileName = `${data.appointment_id}/${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(fileName, data.attachment, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('message-attachments')
          .getPublicUrl(fileName);

        attachmentUrl = publicUrl;
        attachmentType = data.attachment.type;
        attachmentName = data.attachment.name;
        attachmentSize = data.attachment.size;
      }

      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: data.sender_id,
          content: data.content,
          appointment_id: data.appointment_id,
          is_read: false,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
          attachment_name: attachmentName,
          attachment_size: attachmentSize,
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['messages', variables.appointment_id] 
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// Mark messages as read
export function useMarkMessagesAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      appointment_id: string;
      user_id: string;
    }) => {
      // Mark all unread messages in this conversation as read
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('appointment_id', data.appointment_id)
        .neq('sender_id', data.user_id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['messages', variables.appointment_id] 
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// Typing indicator hook
export function useTypingIndicator(appointmentId: string, userId: string) {
  const [typingUsers, setTypingUsers] = useState<any>({});

  useEffect(() => {
    if (!appointmentId || !userId) return;

    const channel = supabase.channel(`typing:${appointmentId}`);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setTypingUsers(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User started typing:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User stopped typing:', key, leftPresences);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointmentId, userId]);

  const setTyping = async (isTyping: boolean) => {
    const channel = supabase.channel(`typing:${appointmentId}`);
    
    await channel.subscribe();
    
    if (isTyping) {
      await channel.track({ user_id: userId });
    } else {
      await channel.untrack();
    }
  };

  // Check if other users (not current user) are typing
  const isOtherUserTyping = Object.values(typingUsers).some(
    (presences: any) => {
      if (!Array.isArray(presences)) return false;
      return presences.some((presence: any) => presence.user_id !== userId);
    }
  );

  return { isOtherUserTyping, setTyping };
}
