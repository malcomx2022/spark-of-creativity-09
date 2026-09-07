import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthUser } from '@/hooks/useAuthUser';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  AlertCircle, CheckCircle2, Clock, AlertTriangle, RefreshCw,
  Filter, ArrowUpDown, Activity, TrendingUp, ClipboardList
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const URGENCY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  immediate: { label: 'Immédiat', color: 'text-red-500', bgColor: 'bg-red-500' },
  urgent: { label: 'Urgent', color: 'text-orange-500', bgColor: 'bg-orange-500' },
  'semi-urgent': { label: 'Semi-urgent', color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  'non-urgent': { label: 'Non urgent', color: 'text-green-500', bgColor: 'bg-green-500' },
};

interface TriageHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TriageHistory({ open, onOpenChange }: TriageHistoryProps) {
  const { data: user } = useAuthUser();

  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc' | 'score_desc' | 'score_asc'>('date_desc');

  const { data: triageResults = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['triage-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('triage_results')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && open,
  });

  // Filtrer et trier les résultats
  const filteredResults = useMemo(() => {
    let result = [...triageResults];

    // Filtrer par niveau d'urgence
    if (urgencyFilter !== 'all') {
      result = result.filter(r => r.urgency_level === urgencyFilter);
    }

    // Trier
    result.sort((a, b) => {
      switch (sortOrder) {
        case 'date_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'score_desc':
          return b.score - a.score;
        case 'score_asc':
          return a.score - b.score;
        default:
          return 0;
      }
    });

    return result;
  }, [triageResults, urgencyFilter, sortOrder]);

  // Statistiques
  const stats = useMemo(() => {
    if (triageResults.length === 0) {
      return {
        total: 0,
        distribution: { immediate: 0, urgent: 0, 'semi-urgent': 0, 'non-urgent': 0 },
        avgScore: 0,
      };
    }

    const total = triageResults.length;
    const distribution = { immediate: 0, urgent: 0, 'semi-urgent': 0, 'non-urgent': 0 };
    let sumScore = 0;

    triageResults.forEach(r => {
      const level = r.urgency_level as keyof typeof distribution;
      if (level in distribution) {
        distribution[level]++;
      }
      sumScore += r.score;
    });

    return {
      total,
      distribution,
      avgScore: sumScore / total,
    };
  }, [triageResults]);

  const formatTriageDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: fr });
  };

  const formatFullDate = (dateString: string) => {
    return format(new Date(dateString), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
  };

  const toggleSort = () => {
    const sortOptions: typeof sortOrder[] = ['date_desc', 'date_asc', 'score_desc', 'score_asc'];
    const currentIndex = sortOptions.indexOf(sortOrder);
    const nextIndex = (currentIndex + 1) % sortOptions.length;
    setSortOrder(sortOptions[nextIndex]);
  };

  const getSortLabel = () => {
    switch (sortOrder) {
      case 'date_desc': return 'Plus récent';
      case 'date_asc': return 'Plus ancien';
      case 'score_desc': return 'Score élevé';
      case 'score_asc': return 'Score faible';
    }
  };

  const getUrgencyIcon = (level: string) => {
    switch (level) {
      case 'immediate':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'urgent':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'semi-urgent':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
  };

  const getUrgencyBadge = (level: string) => {
    const config = URGENCY_CONFIG[level] || URGENCY_CONFIG['non-urgent'];
    return <Badge className={config.bgColor}>{config.label}</Badge>;
  };

  // Skeleton loading
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <Skeleton className="h-6 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </DialogHeader>

          {/* Skeleton stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="p-3">
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-6 w-8" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Skeleton filtres */}
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24 ml-auto" />
          </div>

          {/* Skeleton résultats */}
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <div>
                        <Skeleton className="h-4 w-48 mb-1" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Historique des évaluations
                {stats.total > 0 && (
                  <Badge variant="secondary">{stats.total}</Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Vos évaluations d'urgence médicale
              </DialogDescription>
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
        </DialogHeader>

        {/* Statistiques */}
        {stats.total > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <Activity className="h-3 w-3" />
                  Total
                </div>
                <p className="text-xl font-bold">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="h-3 w-3" />
                  Score moyen
                </div>
                <p className="text-xl font-bold">{stats.avgScore.toFixed(1)}/25</p>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-2">Répartition</div>
                <div className="space-y-1">
                  {Object.entries(URGENCY_CONFIG).map(([level, config]) => {
                    const count = stats.distribution[level as keyof typeof stats.distribution] || 0;
                    const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                    return (
                      <div key={level} className="flex items-center gap-2 text-xs">
                        <span className={`w-16 ${config.color}`}>{config.label}</span>
                        <Progress value={percentage} className="h-2 flex-1" />
                        <span className="w-4 text-right text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filtres et tri */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="immediate">Immédiat</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="semi-urgent">Semi-urgent</SelectItem>
              <SelectItem value="non-urgent">Non urgent</SelectItem>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={toggleSort}>
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  {getSortLabel()}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Cliquer pour changer le tri</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {filteredResults.length !== triageResults.length && (
            <Badge variant="outline" className="ml-auto">
              {filteredResults.length} résultat{filteredResults.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Liste des résultats */}
        {filteredResults.length === 0 ? (
          <div className="text-center py-8">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            {urgencyFilter !== 'all' ? (
              <>
                <p className="text-muted-foreground">
                  Aucune évaluation avec le niveau "{URGENCY_CONFIG[urgencyFilter]?.label || urgencyFilter}"
                </p>
                <Button
                  variant="link"
                  onClick={() => setUrgencyFilter('all')}
                  className="mt-2"
                >
                  Voir toutes les évaluations
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Aucune évaluation enregistrée</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Complétez le formulaire de triage pour enregistrer votre première évaluation
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => onOpenChange(false)}
                >
                  Faire une évaluation
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResults.map((result: any) => (
              <Card key={result.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getUrgencyIcon(result.urgency_level)}
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="font-medium line-clamp-1 cursor-help">{result.message}</p>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm">
                              <p>{result.message}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm text-muted-foreground cursor-help">
                                {formatTriageDate(result.created_at)}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatFullDate(result.created_at)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Score: {result.score}/25</Badge>
                      {getUrgencyBadge(result.urgency_level)}
                    </div>
                  </div>

                  {result.recommendations && result.recommendations.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-sm text-muted-foreground line-clamp-2 cursor-help">
                            <span className="font-medium">Recommandations : </span>
                            {result.recommendations.join(' • ')}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <ul className="list-disc list-inside space-y-1">
                            {result.recommendations.map((rec: string, idx: number) => (
                              <li key={idx}>{rec}</li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
