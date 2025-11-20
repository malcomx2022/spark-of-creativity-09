import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, Users, User, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { format, isPast, isFuture } from "date-fns";
import { fr } from "date-fns/locale";
import { usePatientGroupSessions } from "@/hooks/usePatientGroupSessions";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";

export function PatientGroupSessionsSection() {
  const { data: user } = useSupabaseUser();
  const { data: sessions, isLoading } = usePatientGroupSessions(user?.id);

  const getPaymentStatusBadge = (status: string) => {
    const config = {
      paid: {
        icon: CheckCircle,
        color: "bg-green-500",
        text: "Payé"
      },
      pending: {
        icon: AlertCircle,
        color: "bg-orange-500",
        text: "En attente"
      },
      failed: {
        icon: XCircle,
        color: "bg-red-500",
        text: "Échec"
      }
    };

    const statusConfig = config[status as keyof typeof config] || config.pending;
    const Icon = statusConfig.icon;

    return (
      <Badge className={`${statusConfig.color} text-white gap-1`}>
        <Icon className="h-3 w-3" />
        {statusConfig.text}
      </Badge>
    );
  };

  const getSessionStatusBadge = (status: string, scheduledDate: string) => {
    const sessionDateTime = new Date(scheduledDate);
    const isSessionPast = isPast(sessionDateTime);

    if (status === 'annulee') {
      return <Badge className="bg-red-500 text-white">Annulée</Badge>;
    }
    if (status === 'terminee' || isSessionPast) {
      return <Badge className="bg-gray-500 text-white">Terminée</Badge>;
    }
    if (status === 'confirmee') {
      return <Badge className="bg-green-500 text-white">Confirmée</Badge>;
    }
    return <Badge className="bg-blue-500 text-white">Planifiée</Badge>;
  };

  const categorizeSession = (session: any) => {
    const sessionDateTime = new Date(session.session.scheduled_date);
    const isSessionPast = isPast(sessionDateTime);
    
    if (session.session.status === 'annulee') return 'canceled';
    if (session.payment_status === 'pending') return 'pending';
    if (isSessionPast) return 'past';
    return 'upcoming';
  };

  const pendingSessions = sessions?.filter(s => categorizeSession(s) === 'pending') || [];
  const upcomingSessions = sessions?.filter(s => categorizeSession(s) === 'upcoming') || [];
  const pastSessions = sessions?.filter(s => categorizeSession(s) === 'past') || [];
  const canceledSessions = sessions?.filter(s => categorizeSession(s) === 'canceled') || [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
          <p className="text-muted-foreground">Chargement de vos séances...</p>
        </CardContent>
      </Card>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mes séances de groupe</CardTitle>
          <CardDescription>Vos inscriptions aux séances de coaching</CardDescription>
        </CardHeader>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">
            Vous n'êtes inscrit à aucune séance de groupe pour le moment
          </p>
          <Button onClick={() => window.location.href = '/practitioner-search'}>
            Découvrir les séances
          </Button>
        </CardContent>
      </Card>
    );
  }

  const SessionCard = ({ session }: { session: any }) => (
    <Card className="shadow-medical hover:shadow-glow transition-all">
      <CardHeader>
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2">{session.session.session_name}</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Coach {session.session.coach.name}</span>
              <Badge variant="outline" className="ml-2">
                {session.session.coach.specialty}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {getSessionStatusBadge(session.session.status, session.session.scheduled_date)}
            {getPaymentStatusBadge(session.payment_status)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {session.session.description && (
          <p className="text-sm text-muted-foreground">{session.session.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span>{format(new Date(session.session.scheduled_date), "dd MMMM yyyy", { locale: fr })}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span>{session.session.start_time} - {session.session.end_time}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="truncate">{session.session.location}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span>
              {session.session.current_participants}/{session.session.max_participants} participants
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div>
            <p className="text-xl font-bold text-primary">
              {session.session.price_per_person.toLocaleString()} FCFA
            </p>
            <p className="text-xs text-muted-foreground">
              Inscrit le {format(new Date(session.joined_at), "dd/MM/yyyy à HH:mm", { locale: fr })}
            </p>
          </div>

          {session.payment_status === 'pending' && (
            <Button variant="default" size="sm">
              Finaliser le paiement
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* En attente de paiement */}
      {pendingSessions.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertCircle className="h-5 w-5" />
              Paiements en attente ({pendingSessions.length})
            </CardTitle>
            <CardDescription>
              Ces séances nécessitent la finalisation du paiement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Séances à venir */}
      {upcomingSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Séances à venir ({upcomingSessions.length})
            </CardTitle>
            <CardDescription>
              Vos prochaines séances de groupe confirmées
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Historique */}
      {pastSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle className="h-5 w-5" />
              Historique ({pastSessions.length})
            </CardTitle>
            <CardDescription>
              Séances terminées
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pastSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Annulées */}
      {canceledSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              Séances annulées ({canceledSessions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canceledSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
