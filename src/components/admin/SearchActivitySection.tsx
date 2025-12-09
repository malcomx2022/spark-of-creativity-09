import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Eye, Phone, Calendar, MapPin, Filter, RefreshCw, User, UserX } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SearchActivityLog {
  id: string;
  user_id: string | null;
  session_id: string;
  action_type: string;
  practitioner_id: string | null;
  search_filters: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  user_agent: string | null;
  created_at: string;
}

const actionTypeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  view_search_page: { label: 'Vue page', icon: <Eye className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
  filter_specialty: { label: 'Filtre spécialité', icon: <Filter className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
  filter_zone: { label: 'Filtre zone', icon: <MapPin className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
  view_practitioner_details: { label: 'Détails praticien', icon: <Eye className="h-3 w-3" />, color: 'bg-purple-100 text-purple-800' },
  click_contact: { label: 'Clic contact', icon: <Phone className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
  click_appointment: { label: 'Clic RDV', icon: <Calendar className="h-3 w-3" />, color: 'bg-primary/20 text-primary' },
  click_itinerary: { label: 'Clic itinéraire', icon: <MapPin className="h-3 w-3" />, color: 'bg-orange-100 text-orange-800' },
  search_text: { label: 'Recherche texte', icon: <Search className="h-3 w-3" />, color: 'bg-indigo-100 text-indigo-800' },
  close_practitioner_details: { label: 'Fermeture détails', icon: <Eye className="h-3 w-3" />, color: 'bg-gray-100 text-gray-600' },
};

export default function SearchActivitySection() {
  const [filterActionType, setFilterActionType] = useState<string>('all');
  const [filterUserType, setFilterUserType] = useState<string>('all');
  const [searchSession, setSearchSession] = useState('');
  const [dateRange, setDateRange] = useState<string>('7');

  const { data: logs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['search-activity-logs', filterActionType, filterUserType, dateRange],
    queryFn: async () => {
      let query = (supabase as any)
        .from('search_activity_logs')
        .select('*')
        .gte('created_at', subDays(new Date(), parseInt(dateRange)).toISOString())
        .order('created_at', { ascending: false })
        .limit(200);

      if (filterActionType !== 'all') {
        query = query.eq('action_type', filterActionType);
      }

      if (filterUserType === 'authenticated') {
        query = query.not('user_id', 'is', null);
      } else if (filterUserType === 'anonymous') {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SearchActivityLog[];
    },
  });

  // Stats
  const stats = {
    total: logs?.length || 0,
    authenticated: logs?.filter(l => l.user_id).length || 0,
    anonymous: logs?.filter(l => !l.user_id).length || 0,
    appointmentClicks: logs?.filter(l => l.action_type === 'click_appointment').length || 0,
    contactClicks: logs?.filter(l => l.action_type === 'click_contact').length || 0,
  };

  const filteredLogs = logs?.filter(log => {
    if (searchSession && !log.session_id.toLowerCase().includes(searchSession.toLowerCase())) {
      return false;
    }
    return true;
  }) || [];

  const getActionBadge = (actionType: string) => {
    const config = actionTypeLabels[actionType] || { 
      label: actionType, 
      icon: <Eye className="h-3 w-3" />, 
      color: 'bg-gray-100 text-gray-800' 
    };
    return (
      <Badge variant="outline" className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Activité de recherche praticiens
              </CardTitle>
              <CardDescription>
                Suivi des actions des utilisateurs sur la page de recherche
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Actions totales</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.authenticated}</p>
              <p className="text-xs text-muted-foreground">Utilisateurs connectés</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.anonymous}</p>
              <p className="text-xs text-muted-foreground">Visiteurs anonymes</p>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-primary">{stats.appointmentClicks}</p>
              <p className="text-xs text-muted-foreground">Clics RDV</p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-600">{stats.contactClicks}</p>
              <p className="text-xs text-muted-foreground">Clics contact</p>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Dernières 24h</SelectItem>
                <SelectItem value="7">7 derniers jours</SelectItem>
                <SelectItem value="30">30 derniers jours</SelectItem>
                <SelectItem value="90">90 derniers jours</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterActionType} onValueChange={setFilterActionType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type d'action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les actions</SelectItem>
                {Object.entries(actionTypeLabels).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterUserType} onValueChange={setFilterUserType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type d'utilisateur" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="authenticated">Connectés</SelectItem>
                <SelectItem value="anonymous">Anonymes</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Rechercher par session..."
              value={searchSession}
              onChange={(e) => setSearchSession(e.target.value)}
              className="w-[200px]"
            />
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune activité trouvée pour cette période
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead>Session</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(log.created_at), 'dd/MM HH:mm', { locale: fr })}
                      </TableCell>
                      <TableCell>
                        {log.user_id ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 flex items-center gap-1 w-fit">
                            <User className="h-3 w-3" />
                            Connecté
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 flex items-center gap-1 w-fit">
                            <UserX className="h-3 w-3" />
                            Anonyme
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{getActionBadge(log.action_type)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {log.metadata?.practitioner_name && (
                          <span>Praticien: {String(log.metadata.practitioner_name)}</span>
                        )}
                        {log.search_filters?.category && (
                          <span>Catégorie: {String(log.search_filters.category)}</span>
                        )}
                        {log.search_filters?.query && (
                          <span>Recherche: "{String(log.search_filters.query)}"</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.session_id.substring(0, 15)}...
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
