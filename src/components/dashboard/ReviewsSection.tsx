import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star } from 'lucide-react';
import { usePatientReviews } from '@/hooks/useReviews';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

export function ReviewsSection() {
  const { data: user } = useSupabaseUser();
  const { data: reviews = [], isLoading } = usePatientReviews(user?.id);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${
          i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
        }`}
      />
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5" />
          Mes évaluations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Chargement...</p>
        ) : reviews.length === 0 ? (
          <p className="text-muted-foreground">
            Aucune évaluation pour le moment. Laissez un avis après vos consultations pour aider la communauté.
          </p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  {renderStars(review.rating)}
                  <span className="text-sm text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-sm">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
