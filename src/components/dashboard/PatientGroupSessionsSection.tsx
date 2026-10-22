import type { PatientGroupSession } from "@/hooks/usePatientGroupSessions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, MapPin, Users, User, CheckCircle, XCircle, AlertCircle, Loader2, ChevronLeft, ChevronRight, RefreshCw, Search, Copy, Check, Wallet } from "lucide-react";
import { format, isPast, isFuture } from "date-fns";
import { fr } from "date-fns/locale";
import { usePatientGroupSessions } from "@/hooks/usePatientGroupSessions";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useState, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
// ✅ CORRECTION P1 #6: Utiliser le widget de retry au lieu de RegisterSessionDialog
import { RetryGroupSessionPaymentWidget } from "@/components/coach/RetryGroupSessionPaymentWidget";

// Traductions des statuts
const SESSION_STATUS_LABELS: Record<string, string> = {
  planifiee: 'Planifiée',
  confirmee: 'Confirmée',
  annulee: 'Annulée',
  terminee: 'Terminée',
};

export function PatientGroupSessionsSection() {
  const { data: user } = useAuthUser();
  const [page, setPage] = useState(0);
  const { data: sessionsResult, isLoading, isFetching, refetch } = usePatientGroupSessions(user?.id, page, 20);
  const sessions = useMemo(() => sessionsResult?.data || [], [sessionsResult?.data]);
  const totalCount = sessionsResult?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);
  const [selectedParticipation, setSelectedParticipation] = useState<PatientGroupSession>(null);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);

  // Recherche et copie
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLocation, setCopiedLocation] = useState<string | null>(null);

  // Fonction pour copier l'adresse
  const handleCopyLocation = async (location: string) => {
    try {
      await navigator.clipboard.writeText(location);
      setCopiedLocation(location);
      toast({ title: 'Adresse copiée', description: 'L\'adresse a été copiée dans le presse-papiers.' });
      setTimeout(() => setCopiedLocation(null), 2000);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier l\'adresse.', variant: 'destructive' });
    }
  };

  // ✅ CORRECTION P1 #6: Utiliser le widget de retry pour les paiements en attente
  const handleRetryPayment = (participation: PatientGroupSession) => {
    setSelectedParticipation(participation);
    setRetryDialogOpen(true);
  };

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

  const categorizeSession = (session: PatientGroupSession) => {
    const sessionDateTime = new Date(session.session.scheduled_date);
    const isSessionPast = isPast(sessionDateTime);

    if (session.session.status === 'annulee') return 'canceled';
    // ✅ Bug #6 FIX: Inclure 'failed' dans les paiements en attente
    if (session.payment_status === 'pending' || session.payment_status === 'failed') return 'pending';
    if (isSessionPast) return 'past';
    return 'upcoming';
  };

  // Filtrer par recherche
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const query = searchQuery.toLowerCase();
    return sessions.filter(s =>
      s.session.session_name.toLowerCase().includes(query) ||
      s.session.coach.name.toLowerCase().includes(query) ||
      s.session.location.toLowerCase().includes(query)
    );
  }, [sessions, searchQuery]);

  const categorizedSessions = useMemo(() => {
    const pending = filteredSessions?.filter(s => categorizeSession(s) === 'pending') || [];
    const upcoming = filteredSessions?.filter(s => categorizeSession(s) === 'upcoming') || [];
    const past = filteredSessions?.filter(s => categorizeSession(s) === 'past') || [];
    const canceled = filteredSessions?.filter(s => categorizeSession(s) === 'canceled') || [];
    return { pending, upcoming, past, canceled };
  }, [filteredSessions]);

  const { pending: pendingSessions, upcoming: upcomingSessions, past: pastSessions, canceled: canceledSessions } = categorizedSessions;

  // Statistiques
  const stats = useMemo(() => {
    const allSessions = sessions || [];
    const paid = allSessions.filter(s => s.payment_status === 'paid');
    const pendingPayment = allSessions.filter(s => s.payment_status === 'pending' || s.payment_status === 'failed');
    const totalPaid = paid.reduce((sum, s) => sum + (s.session.price_per_person || 0), 0);
    const totalPending = pendingPayment.reduce((sum, s) => sum + (s.session.price_per_person || 0), 0);

    return {
      total: allSessions.length,
      paid: paid.length,
      pending: pendingPayment.length,
      totalPaid,
      totalPending,
    };
  }, [sessions]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-32" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
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
          <Button onClick={() => window.location.href = '/search-coaches'}>
            Découvrir les séances
          </Button>
        </CardContent>
      </Card>
    );
  }

  const SessionCard = ({ session }: { session: PatientGroupSession }) => (
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm text-muted-foreground line-clamp-2 cursor-help">{session.session.description}</p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                <p>{session.session.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
            <span>{format(new Date(session.session.scheduled_date), "dd MMM yyyy", { locale: fr })}</span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary flex-shrink-0" />
            <span>{session.session.start_time} - {session.session.end_time}</span>
          </div>

          <div className="flex items-center gap-2 col-span-2">
            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate max-w-[250px] cursor-help">{session.session.location}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <p>{session.session.location}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => handleCopyLocation(session.session.location)}
            >
              {copiedLocation === session.session.location ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary flex-shrink-0" />
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground cursor-help">
                    Inscrit le {format(new Date(session.joined_at), "dd/MM/yy", { locale: fr })}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{format(new Date(session.joined_at), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* ✅ Bug #6 FIX: Afficher bouton retry pour pending ET failed */}
          {(session.payment_status === 'pending' || session.payment_status === 'failed') && (
            <Button
              variant="default"
              size="sm"
              onClick={() => handleRetryPayment(session)}
            >
              {session.payment_status === 'failed' ? 'Réessayer le paiement' : 'Finaliser le paiement'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* En-tête avec statistiques */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Mes séances de groupe</h2>
          <Badge variant="secondary">{stats.total} inscription{stats.total > 1 ? 's' : ''}</Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Rafraîchir"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Recherche */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher séance, coach..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-full sm:w-[220px] h-9"
          />
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Inscriptions</p>
              <p className="text-lg font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Payées</p>
              <p className="text-lg font-bold text-green-600">{stats.paid}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-lg font-bold text-orange-600">{stats.pending}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total payé</p>
              <p className="text-lg font-bold">{stats.totalPaid.toLocaleString()} F</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Message si aucun résultat de recherche */}
      {searchQuery && filteredSessions.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucune séance trouvée pour "{searchQuery}"</p>
            <Button variant="link" onClick={() => setSearchQuery('')} className="mt-2">
              Effacer la recherche
            </Button>
          </CardContent>
        </Card>
      )}

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
      
      {/* ✅ CORRECTION P1 #6: Dialog de retry paiement (pas de re-inscription) */}
      {selectedParticipation && (
        <RetryGroupSessionPaymentWidget
          open={retryDialogOpen}
          onOpenChange={setRetryDialogOpen}
          participantId={selectedParticipation.id}
          session={{
            id: selectedParticipation.session.id,
            session_name: selectedParticipation.session.session_name,
            price_per_person: selectedParticipation.session.price_per_person,
            scheduled_date: selectedParticipation.session.scheduled_date,
            start_time: selectedParticipation.session.start_time
          }}
          onSuccess={() => {
            setRetryDialogOpen(false);
            setSelectedParticipation(null);
          }}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} sur {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
