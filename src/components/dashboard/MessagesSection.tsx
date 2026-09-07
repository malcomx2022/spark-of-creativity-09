import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useConversations } from '@/hooks/useConversations';
import { ConversationsList } from '@/components/messaging/ConversationsList';
import { ChatInterface } from '@/components/messaging/ChatInterface';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare, RefreshCw, Search, Calendar, ArrowLeft,
  Mail, MailOpen, Users
} from 'lucide-react';
import type { Conversation } from '@/hooks/useConversations';

export function MessagesSection() {
  const { data: user } = useAuthUser();
  const {
    data,
    isLoading,
    isFetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useConversations(user?.id, 'patient');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const hasAutoSelected = useRef(false);

  // Aplatir les pages de conversations
  const allConversations = data?.pages.flatMap(page => page.conversations) || [];

  // Filtrer par recherche
  const conversations = useMemo(() => {
    if (!searchQuery.trim()) return allConversations;
    const query = searchQuery.toLowerCase();
    return allConversations.filter(c =>
      c.practitioner_name.toLowerCase().includes(query) ||
      c.last_message.toLowerCase().includes(query)
    );
  }, [allConversations, searchQuery]);

  // Statistiques
  const stats = useMemo(() => {
    const totalUnread = allConversations.reduce((sum, c) => sum + c.unread_count, 0);
    const conversationsWithUnread = allConversations.filter(c => c.unread_count > 0).length;
    return {
      total: allConversations.length,
      totalUnread,
      conversationsWithUnread,
    };
  }, [allConversations]);

  // Auto-select first conversation when loaded (only once)
  useEffect(() => {
    if (!hasAutoSelected.current && !selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
      hasAutoSelected.current = true;
    }
  }, [conversations, selectedConversation]);

  // Handle conversation selection with mobile view
  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setShowMobileChat(true);
  };

  // Handle back button on mobile
  const handleBackToList = () => {
    setShowMobileChat(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton en-tête */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton statistiques */}
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton conversations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="h-[calc(100vh-20rem)]">
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24 mb-2" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2 hidden lg:block">
            <Card className="h-[calc(100vh-20rem)]">
              <CardContent className="flex items-center justify-center h-full">
                <Skeleton className="h-4 w-48" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            Messages
            {stats.totalUnread > 0 && (
              <Badge variant="destructive">{stats.totalUnread}</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Communiquez avec vos praticiens
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              Conversations
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Mail className="h-4 w-4" />
              Non lus
            </div>
            <p className="text-2xl font-bold text-destructive">{stats.totalUnread}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <MailOpen className="h-4 w-4" />
              Avec non lus
            </div>
            <p className="text-2xl font-bold">{stats.conversationsWithUnread}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom de praticien..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Layout principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des conversations - cachée sur mobile si chat ouvert */}
        <div className={`lg:col-span-1 ${showMobileChat ? 'hidden lg:block' : ''}`}>
          <ConversationsList
            conversations={conversations}
            selectedConversation={selectedConversation}
            onSelectConversation={handleSelectConversation}
            userType="patient"
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            searchQuery={searchQuery}
          />
        </div>

        {/* Interface de chat - visible sur mobile si sélectionné */}
        <div className={`lg:col-span-2 ${!showMobileChat ? 'hidden lg:block' : ''}`}>
          {selectedConversation && user ? (
            <div className="relative">
              {/* Bouton retour sur mobile */}
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden absolute top-2 left-2 z-10"
                onClick={handleBackToList}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
              <ChatInterface
                conversation={selectedConversation}
                currentUserId={user.id}
                userType="patient"
              />
            </div>
          ) : (
            <Card className="h-[calc(100vh-20rem)]">
              <CardContent className="flex flex-col items-center justify-center h-full">
                <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  Sélectionnez une conversation pour commencer
                </p>
                {allConversations.length === 0 && (
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = '/patient-dashboard?tab=appointments'}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Prendre un rendez-vous
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
