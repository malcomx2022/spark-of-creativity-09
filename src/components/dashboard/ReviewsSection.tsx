import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  Star, User, RefreshCw, Filter, ArrowUpDown, Calendar,
  TrendingUp, MessageSquare
} from 'lucide-react';
import { usePatientReviews } from '@/hooks/useReviews';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export function ReviewsSection() {
  const { data: user } = useSupabaseUser();
  const { data: reviews = [], isLoading, isFetching, refetch } = usePatientReviews(user?.id);

  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc' | 'rating_desc' | 'rating_asc'>('date_desc');

  // Filtrer et trier les avis
  const filteredReviews = useMemo(() => {
    let result = [...reviews];

    // Filtrer par note
    if (ratingFilter !== 'all') {
      const rating = parseInt(ratingFilter);
      result = result.filter(r => r.rating === rating);
    }

    // Trier
    result.sort((a, b) => {
      switch (sortOrder) {
        case 'date_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'rating_desc':
          return b.rating - a.rating;
        case 'rating_asc':
          return a.rating - b.rating;
        default:
          return 0;
      }
    });

    return result;
  }, [reviews, ratingFilter, sortOrder]);

  // Statistiques
  const stats = useMemo(() => {
    if (reviews.length === 0) {
      return {
        total: 0,
        average: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      };
    }

    const total = reviews.length;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const average = sum / total;

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(r => {
      distribution[r.rating as keyof typeof distribution]++;
    });

    return { total, average, distribution };
  }, [reviews]);

  const renderStars = (rating: number, size: 'sm' | 'md' = 'sm') => {
    const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`${sizeClass} ${
          i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
        }`}
      />
    ));
  };

  const formatReviewDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: fr });
  };

  const formatFullDate = (dateString: string) => {
    return format(new Date(dateString), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
  };

  const toggleSort = () => {
    const sortOptions: typeof sortOrder[] = ['date_desc', 'date_asc', 'rating_desc', 'rating_asc'];
    const currentIndex = sortOptions.indexOf(sortOrder);
    const nextIndex = (currentIndex + 1) % sortOptions.length;
    setSortOrder(sortOptions[nextIndex]);
  };

  const getSortLabel = () => {
    switch (sortOrder) {
      case 'date_desc': return 'Plus récent';
      case 'date_asc': return 'Plus ancien';
      case 'rating_desc': return 'Meilleure note';
      case 'rating_asc': return 'Note croissante';
    }
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-6 w-24" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-3 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Skeleton avis */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6" />
            Mes évaluations
            {stats.total > 0 && (
              <Badge variant="secondary">{stats.total}</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Vos avis sur les praticiens consultés
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
      {stats.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <MessageSquare className="h-4 w-4" />
                Total des avis
              </div>
              <p className="text-3xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="h-4 w-4" />
                Note moyenne
              </div>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold">{stats.average.toFixed(1)}</p>
                <div className="flex">{renderStars(Math.round(stats.average), 'md')}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground mb-2">Répartition</div>
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = stats.distribution[star as keyof typeof stats.distribution];
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-3">{star}</span>
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <Progress value={percentage} className="h-2 flex-1" />
                      <span className="w-6 text-right text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Liste des avis
              <Badge variant="secondary">{filteredReviews.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="5">5 étoiles</SelectItem>
                  <SelectItem value="4">4 étoiles</SelectItem>
                  <SelectItem value="3">3 étoiles</SelectItem>
                  <SelectItem value="2">2 étoiles</SelectItem>
                  <SelectItem value="1">1 étoile</SelectItem>
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredReviews.length === 0 ? (
            <div className="text-center py-12">
              <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              {ratingFilter !== 'all' ? (
                <>
                  <p className="text-muted-foreground">
                    Aucun avis avec {ratingFilter} étoile{parseInt(ratingFilter) > 1 ? 's' : ''}
                  </p>
                  <Button
                    variant="link"
                    onClick={() => setRatingFilter('all')}
                    className="mt-2"
                  >
                    Voir tous les avis
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">Aucune évaluation pour le moment</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Laissez un avis après vos consultations pour aider la communauté
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => window.location.href = '/patient-dashboard?tab=appointments'}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Voir mes rendez-vous
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReviews.map((review) => (
                <div key={review.id} className="p-4 border rounded-lg space-y-3 hover:bg-muted/30 transition-colors">
                  {review.practitioner && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{review.practitioner.name}</span>
                      <Badge variant="outline">{review.practitioner.specialty}</Badge>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex">{renderStars(review.rating)}</div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-muted-foreground cursor-help">
                            {formatReviewDate(review.created_at)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{formatFullDate(review.created_at)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {review.appointment?.specialty && (
                    <p className="text-xs text-muted-foreground">
                      Type de consultation : {review.appointment.specialty}
                    </p>
                  )}
                  {review.comment && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm line-clamp-3 cursor-help">{review.comment}</p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <p className="whitespace-pre-wrap">{review.comment}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
