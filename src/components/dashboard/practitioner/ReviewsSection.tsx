import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp } from "lucide-react";

export default function ReviewsSection() {
  // Mock data
  const stats = {
    averageRating: 4.7,
    totalReviews: 156,
    distribution: [
      { stars: 5, count: 120 },
      { stars: 4, count: 28 },
      { stars: 3, count: 5 },
      { stars: 2, count: 2 },
      { stars: 1, count: 1 },
    ],
  };

  const reviews = [
    {
      id: "1",
      patientName: "Marie D.",
      rating: 5,
      comment: "Très professionnel et à l'écoute. Je recommande vivement !",
      date: "15 Oct 2025",
      hasResponse: false,
    },
    {
      id: "2",
      patientName: "Jean M.",
      rating: 4,
      comment: "Bon service, ponctuel. Petit bémol sur la communication.",
      date: "14 Oct 2025",
      hasResponse: true,
      response: "Merci pour votre retour. Je prends note de votre commentaire sur la communication.",
    },
  ];

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

  return (
    <div className="space-y-6">
      {/* Statistiques */}
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
            <div className="flex items-center gap-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
              <span className="text-xl font-bold">+12%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution des notes */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution des notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.distribution.map((item) => (
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

      {/* Liste des avis */}
      <Card>
        <CardHeader>
          <CardTitle>Avis récents</CardTitle>
          <CardDescription>Lisez et répondez aux commentaires de vos patients</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {reviews.map((review) => (
              <div key={review.id} className="border-b pb-6 last:border-0">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium">{review.patientName}</p>
                    <p className="text-sm text-muted-foreground">{review.date}</p>
                  </div>
                  {renderStars(review.rating)}
                </div>
                
                <p className="text-sm mb-3">{review.comment}</p>

                {review.hasResponse ? (
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-xs font-medium mb-1">Votre réponse</p>
                    <p className="text-sm">{review.response}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Répondre à cet avis..."
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm">Publier la réponse</Button>
                      <Button size="sm" variant="outline">
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}