import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp } from "lucide-react";
import { usePractitionerReviews, useReviewStats } from '@/hooks/usePractitionerReviews';

interface ReviewsSectionProps {
  practitionerId: string;
}

export default function ReviewsSection({ practitionerId }: ReviewsSectionProps) {
  const [page, setPage] = useState(1);
  const limit = 10;
  const { data: reviews = [], isLoading } = usePractitionerReviews(practitionerId, page, limit);
  const { data: stats } = useReviewStats(practitionerId);

  const distributionMemo = useMemo(() => {
    if (!stats || !stats.distribution) return [];
    return stats.distribution;
  }, [stats]);

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

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Note moyenne
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold">{stats.averageRating}</div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                  sur 5
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total d'avis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalReviews}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xl font-bold">
                  {stats.totalReviews > 0 ? '📊' : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Distribution des notes */}
      {stats && stats.totalReviews > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distribution des notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {distributionMemo.map((item) => (
                <div key={item.stars} className="flex items-center gap-3">
                  <div className="w-16 text-sm">{item.stars} étoiles</div>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400"
                      style={{ width: `${(item.count / stats.totalReviews) * 100}%` }}
                    />
                  </div>
                  <div className="w-12 text-sm text-right text-muted-foreground">
                    {item.count}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste des avis */}
      <Card>
        <CardHeader>
          <CardTitle>Avis récents</CardTitle>
          <CardDescription>Lisez et répondez aux commentaires de vos patients</CardDescription>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aucun avis pour le moment
            </p>
          ) : (
            <div className="space-y-6">
              {reviews.map((review) => (
                <div key={review.id} className="border-b pb-6 last:border-0">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">Patient</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(review.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    {renderStars(review.rating)}
                  </div>
                  
                  {review.comment && <p className="text-sm mb-3">{review.comment}</p>}
                </div>
              ))}
              
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
  );
}