import { useState, useMemo } from 'react';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useConversations } from '@/hooks/useConversations';
import { ConversationsList } from '@/components/messaging/ConversationsList';
import { ChatInterface } from '@/components/messaging/ChatInterface';
import { useConversationSelection } from '@/hooks/useConversationSelection';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, RefreshCw, HelpCircle, Search, Filter, Mail, MailOpen, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export function PractitionerMessagesSection() {
  const { data: user } = useAuthUser();
  const queryClient = useQueryClient();
  const {
    data,
    isLoading,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useConversations(user?.id, 'practitioner');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread'>('all');

  // Aplatir les pages de conversations
  const allConversations = useMemo(() => data?.pages.flatMap(page => page.conversations) || [], [data]);

  const { selectedConversation, selectConversation: setSelectedConversation, linkedError } = useConversationSelection(allConversations, user?.id);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = allConversations.length;
    const unreadCount = allConversations.reduce((sum, c) => sum + c.unread_count, 0);
    const withUnread = allConversations.filter(c => c.unread_count > 0).length;
    return { total, unreadCount, withUnread };
  }, [allConversations]);

  // Filter conversations based on search and status
  const filteredConversations = useMemo(() => {
    let filtered = allConversations;

    // Filter by status
    if (statusFilter === 'unread') {
      filtered = filtered.filter(c => c.unread_count > 0);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.patient_name.toLowerCase().includes(query) ||
        c.last_message.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allConversations, statusFilter, searchQuery]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Skeleton loading
  if (isLoading) {
    return (
      <TooltipProvider>
        <div className="space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
          {/* Stats skeleton */}
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </div>
            ))}
          </div>
          {/* Search skeleton */}
          <div className="flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-32" />
          </div>
          {/* Content skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="lg:col-span-2">
              <Skeleton className="h-[500px] w-full rounded-lg" />
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Global Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            {linkedError && <p role="alert">Cette conversation est indisponible ou son accès a été retiré.</p>}
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6" />
              Messages
              {stats.unreadCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {stats.unreadCount} non lu(s)
                </Badge>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Échangez avec vos patients avant et après les consultations. Les messages sont liés aux rendez-vous.</p>
                </TooltipContent>
              </Tooltip>
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Communiquez avec vos patients
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing || isFetching ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Users className="h-3.5 w-3.5" />
              Conversations
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="border rounded-lg p-4 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300 text-xs mb-1">
              <Mail className="h-3.5 w-3.5" />
              Non lus
            </div>
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.unreadCount}</p>
          </div>
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MailOpen className="h-3.5 w-3.5" />
              Avec non lus
            </div>
            <p className="text-2xl font-bold">{stats.withUnread}</p>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un patient ou message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'unread')}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Filtrer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes ({stats.total})</SelectItem>
                <SelectItem value="unread">Non lues ({stats.withUnread})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(searchQuery || statusFilter !== 'all') && (
            <Badge variant="secondary">
              {filteredConversations.length} résultat(s)
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ConversationsList
              conversations={filteredConversations}
              selectedConversation={selectedConversation}
              onSelectConversation={setSelectedConversation}
              userType="practitioner"
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
              searchQuery={searchQuery}
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
              <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] border rounded-lg bg-muted/20">
                <MessageSquare className="h-16 w-16 text-muted-foreground mb-4 opacity-30" />
                <p className="text-muted-foreground font-medium">
                  Sélectionnez une conversation
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Choisissez un patient pour voir les messages
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
