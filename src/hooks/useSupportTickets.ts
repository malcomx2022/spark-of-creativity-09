import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SupportTicketStatus = 'ouvert' | 'en_cours' | 'resolu' | 'ferme';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

/** Ligne `support_tickets` (colonnes snake_case renvoyées par l'API). */
export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  status: SupportTicketStatus | string;
  priority: SupportTicketPriority | string | null;
  response?: string | null;
  appointment_id?: string | null;
  attachments?: string[] | null;
  assigned_to?: string | null;
  tags?: string[] | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

/** FAQ publiée (GET /faqs). */
export interface Faq {
  id: string;
  category: string;
  question: string;
  answer: string;
  target_audience: 'all' | 'patients' | 'practitioners' | string;
  updated_at: string;
}

/** Tickets de l'utilisateur connecté (déduit du jeton ; `userId` ne sert qu'à activer la requête). */
export function useSupportTickets(userId?: string, status?: SupportTicketStatus) {
  return useQuery<SupportTicket[]>({
    queryKey: ['support-tickets', userId],
    queryFn: async () => {
      if (!userId) return [];

      // ✅ Limiter à 50 derniers tickets
      const data = await api.get<SupportTicket[]>('/support/tickets', { query: { limit: 50, status } });
      return data || [];
    },
    enabled: !!userId,
    staleTime: 30000, // ✅ Cache pendant 30 secondes
  });
}

export function useSupportTicket(ticketId?: string) {
  return useQuery<SupportTicket | null>({
    queryKey: ['support-ticket', ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      return api.get<SupportTicket>(`/support/tickets/${ticketId}`);
    },
    enabled: !!ticketId,
  });
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      /** Ignoré : l'utilisateur est déduit du jeton par l'API (conservé pour compatibilité). */
      user_id?: string;
      subject: string;
      description: string;
      priority?: 'low' | 'medium' | 'high' | string;
      appointment_id?: string;
      attachments?: string[];
    }) => {
      return api.post<SupportTicket>('/support/tickets', {
        subject: data.subject,
        description: data.description,
        priority: data.priority || 'medium',
        ...(data.appointment_id ? { appointmentId: data.appointment_id } : {}),
        ...(data.attachments?.length ? { attachments: data.attachments } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

/** L'utilisateur peut fermer son propre ticket. */
export function useCloseSupportTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ticketId: string) => {
      return api.post<SupportTicket>(`/support/tickets/${ticketId}/close`);
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      if (ticket?.id) queryClient.invalidateQueries({ queryKey: ['support-ticket', ticket.id] });
    },
  });
}

/** FAQ publiées (route publique), filtrées par audience et/ou catégorie. */
export function useFaqs(audience?: 'patients' | 'practitioners', category?: string) {
  return useQuery<Faq[]>({
    queryKey: ['faqs', audience, category],
    queryFn: async () => {
      const data = await api.get<Faq[]>('/faqs', { query: { audience, category }, auth: false });
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
