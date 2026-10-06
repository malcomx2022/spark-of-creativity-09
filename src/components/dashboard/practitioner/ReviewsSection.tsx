import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, TrendingUp, TrendingDown, RefreshCw, HelpCircle, Search, Filter, MessageSquare, Users, Award } from "lucide-react";
import { usePractitionerReviews, useReviewStats } from '@/hooks/usePractitionerReviews';
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface ReviewsSectionProps {
  practitionerId: string;
}

export default function ReviewsSection({ practitionerId }: ReviewsSectionProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const limit = 10;
  const { data: reviews = [], isLoading, isFetching, refetch } = usePractitionerReviews(practitionerId, page, limit);
  const { data: stats, refetch: refetchStats } = useReviewStats(practitionerId);

  const distributionMemo = useMemo(() => {
    if (!stats || !stats.distribution) return [];
    return stats.distribution;
  }, [stats]);

  // Filter reviews based on search and rating
  const filteredReviews = useMemo(() => {
    let filtered = reviews;

    // Filter by rating
    if (ratingFilter !== 'all') {
      const rating = parseInt(ratingFilter);
      filtered = filtered.filter(r => r.rating === rating);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => {
        const profile = r.profiles;
        const name = profile?.full_name?.toLowerCase() || '';
        const comment = r.comment?.toLowerCase() || '';
        return name.includes(query) || comment.includes(query);
      });
    }

    return filtered;
  }, [reviews, ratingFilter, searchQuery]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), refetchStats()]);
    setIsRefreshing(false);
  };

  // Format date for display
  const formatReviewDate = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
    } catch {
      return date;
    }
  };

  const formatFullDate = (date: string) => {
    try {
      return format(new Date(date), "EEEE dd MMMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return date;
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  // Calculate trend (compare recent vs older reviews)
  const trend = useMemo(() => {
    if (!reviews || reviews.length < 2) return null;
    const midpoint = Math.floor(reviews.length / 2);
    const recentAvg = reviews.slice(0, midpoint).reduce((sum, r) => sum + r.rating, 0) / midpoint;
    const olderAvg = reviews.slice(midpoint).reduce((sum, r) => sum + r.rating, 0) / (reviews.length - midpoint);
    const diff = recentAvg - olderAvg;
    return { value: Math.round(diff * 10) / 10, isPositive: diff >= 0 };
  }, [reviews]);

  // Skeleton loading
  if (isLoading) {
    return (
      <TooltipProvider>
        <div className="space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
          {/* Stats skeleton */}
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Distribution skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[5, 4, 3, 2, 1].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </CardContent>
          </Card>
          {/* Reviews skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border-b pb-6">
                  <div className="flex justify-between mb-2">
                    <div className="space-y-1">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-5 w-24" />
                  </div>
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
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
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
              Avis reçus
              <Badge variant="secondary" className="ml-2">
                {stats?.totalReviews || 0} avis
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>Les avis de vos patients après leurs consultations. Une bonne note améliore votre visibilité.</p>
                </TooltipContent>
              </Tooltip>
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Consultez les retours de vos patients
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

        {/* Statistiques */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-700 dark:text-yellow-300 flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Note moyenne
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Moyenne de toutes vos notes sur 5</p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">{stats.averageRating}</div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                    sur 5
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Total d'avis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalReviews}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  {trend && trend.isPositive ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  Tendance
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Évolution de vos notes récentes vs anciennes</p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trend ? (
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {trend.isPositive ? '+' : ''}{trend.value}
                    </span>
                    <Badge
                      variant="outline"
                      className={trend.isPositive
                        ? 'bg-green-100 text-green-700 border-green-300'
                        : 'bg-red-100 text-red-700 border-red-300'
                      }
                    >
                      {trend.isPositive ? 'En hausse' : 'En baisse'}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Pas assez de données</span>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Distribution des notes */}
        {stats && stats.totalReviews > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Distribution des notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {distributionMemo.map((item) => (
                  <div key={item.stars} className="flex items-center gap-3">
                    <div className="w-20 text-sm flex items-center gap-1">
                      {item.stars}
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    </div>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 transition-all duration-500"
                        style={{ width: `${(item.count / stats.totalReviews) * 100}%` }}
                      />
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-16 text-sm text-right text-muted-foreground cursor-help">
                          {item.count} ({Math.round((item.count / stats.totalReviews) * 100)}%)
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{item.count} avis avec {item.stars} étoile(s)</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Filter */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou commentaire..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrer par note" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les notes</SelectItem>
                <SelectItem value="5">5 étoiles</SelectItem>
                <SelectItem value="4">4 étoiles</SelectItem>
                <SelectItem value="3">3 étoiles</SelectItem>
                <SelectItem value="2">2 étoiles</SelectItem>
                <SelectItem value="1">1 étoile</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(searchQuery || ratingFilter !== 'all') && (
            <Badge variant="secondary">
              {filteredReviews.length} résultat(s)
            </Badge>
          )}
        </div>

        {/* Liste des avis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Avis récents
            </CardTitle>
            <CardDescription>Lisez les commentaires de vos patients</CardDescription>
          </CardHeader>
          <CardContent>
            {reviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Star className="h-16 w-16 mb-4 opacity-30" />
                <p className="font-medium">Aucun avis pour le moment</p>
                <p className="text-sm mt-1">Les avis apparaîtront après vos consultations</p>
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mb-4 opacity-30" />
                <p className="font-medium">Aucun avis trouvé</p>
                <p className="text-sm mt-1">Essayez d'autres critères de recherche</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setRatingFilter('all');
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredReviews.map((review) => {
                  const profile = review.profiles;
                  return (
                    <div key={review.id} className="border-b pb-6 last:border-0 hover:bg-muted/30 -mx-4 px-4 py-4 transition-colors rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{profile?.full_name || 'Patient anonyme'}</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-sm text-muted-foreground cursor-help">
                                {formatReviewDate(review.created_at)}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{formatFullDate(review.created_at)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          {renderStars(review.rating)}
                          <Badge variant="outline" className="ml-2">
                            {review.rating}/5
                          </Badge>
                        </div>
                      </div>

                      {review.comment ? (
                        <p className="text-sm bg-muted/50 p-3 rounded-lg italic">"{review.comment}"</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Aucun commentaire</p>
                      )}
                    </div>
                  );
                })}

                {reviews.length >= limit && (
                  <div className="flex justify-between items-center pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Précédent
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {page}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={reviews.length < limit}
                    >
                      Suivant
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}