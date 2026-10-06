import type { GroupSessionRow } from "@/hooks/useGroupSessions";
import type { PractitionerLocation } from "@/types/practitioner";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  Star,
  User,
  DollarSign,
  Search,
  AlertCircle
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePractitioners } from "@/hooks/usePractitioners";
import { useGroupSessions } from "@/hooks/useGroupSessions";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useCreateAppointment } from "@/hooks/useAppointments";
import { NewAppointmentDialog } from "@/components/NewAppointmentDialog";
import { RegisterSessionDialog } from "@/components/coach/RegisterSessionDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { CreateAppointmentData } from "@/types/appointment";
import { toast } from "@/hooks/use-toast";

export default function CoachSearch() {
  const navigate = useNavigate();
  const { data: user } = useAuthUser();
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [selectedSession, setSelectedSession] = useState<GroupSessionRow>(null);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<PractitionerLocation>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [coachesPage, setCoachesPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  const patientId = user?.id;
  const patientName = (user?.metadata?.full_name as string) || user?.email || "Patient";
  
  const createAppointment = useCreateAppointment(patientId, patientName);

  // Récupérer tous les coachs
  const { data: allPractitioners = [], isLoading: isLoadingCoaches, error: practitionersError } = usePractitioners();
  
  const coaches = useMemo(() => 
    allPractitioners.filter(p => p.practitioner_type === "coach_sportif"),
    [allPractitioners]
  );

  // Récupérer toutes les séances de groupe
  const { sessions: allSessions = [], isLoading: isLoadingSessions } = useGroupSessions();

  // Filtrer les séances disponibles (non passées, non annulées)
  const availableSessions = useMemo(() => {
    const now = new Date();
    return allSessions.filter(s => {
      // Vérifier le statut
      if (s.status !== 'planifiee' && s.status !== 'confirmee') return false;

      // Vérifier que la séance n'est pas passée
      const sessionDateTime = new Date(s.scheduled_date + 'T' + (s.start_time || '00:00'));
      return sessionDateTime > now;
    });
  }, [allSessions]);

  // Zones d'intervention uniques
  const zones = useMemo(() => {
    const allZones = coaches
      .map(c => c.intervention_zone || c.address)
      .filter((z): z is string => !!z);
    return ['all', ...Array.from(new Set(allZones))];
  }, [coaches]);

  // Filtrer les coachs par zone
  const filteredCoaches = useMemo(() => {
    if (selectedZone === 'all') return coaches;
    return coaches.filter(c => c.intervention_zone === selectedZone || c.address === selectedZone);
  }, [coaches, selectedZone]);

  // Paginer les séances
  const paginatedSessions = useMemo(() => {
    const start = (sessionsPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return availableSessions.slice(start, end);
  }, [availableSessions, sessionsPage]);

  // Paginer les coachs
  const paginatedCoaches = useMemo(() => {
    const start = (coachesPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredCoaches.slice(start, end);
  }, [filteredCoaches, coachesPage]);

  const sessionsTotalPages = Math.ceil(availableSessions.length / ITEMS_PER_PAGE);
  const coachesTotalPages = Math.ceil(filteredCoaches.length / ITEMS_PER_PAGE);

  const handleBookSession = (session: GroupSessionRow) => {
    if (!user) {
      navigate('/login');
      return;
    }
    setSelectedSession(session);
    setSessionDialogOpen(true);
  };

  const handleBookIndividual = (coach: PractitionerLocation) => {
    if (!user) {
      toast({
        title: 'Connexion requise',
        description: 'Veuillez vous connecter pour demander un rendez-vous avec un coach.',
        variant: 'destructive'
      });
      navigate('/login');
      return;
    }
    setSelectedCoach(coach);
    setAppointmentDialogOpen(true);
  };

  if (practitionersError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
        <Header />
        <main className="container mx-auto px-4 py-8 pt-24">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Erreur de chargement des coachs. Veuillez réactualiser la page.
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  if (isLoadingCoaches || isLoadingSessions) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
        <Header />
        <main className="container mx-auto px-4 py-8 pt-24">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 pt-24">
        {/* En-tête */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Coachs Sportifs</h1>
          <p className="text-muted-foreground">
            Trouvez votre coach pour des séances de groupe ou un suivi personnalisé
          </p>
        </div>

        {/* Filtres */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Select value={selectedZone} onValueChange={setSelectedZone}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Toutes les zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les zones</SelectItem>
                  {zones.filter(z => z !== 'all').map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="group" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="group" className="gap-2">
              <Users className="h-4 w-4" />
              Séances de groupe
            </TabsTrigger>
            <TabsTrigger value="individual" className="gap-2">
              <User className="h-4 w-4" />
              Coaching individuel
            </TabsTrigger>
          </TabsList>

          {/* Séances de groupe */}
          <TabsContent value="group" className="space-y-6">
            {/* Message pour utilisateurs non connectés */}
            {!user && (
              <Alert className="border-primary/50 bg-primary/5">
                <User className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    Connectez-vous pour vous inscrire aux séances. Votre inscription sera validée par le coach et un paiement confirmera votre participation.
                  </span>
                  <Button variant="outline" size="sm" onClick={() => navigate('/login')} className="ml-4 shrink-0">
                    Se connecter
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {availableSessions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Aucune séance de groupe disponible pour le moment
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-6 md:grid-cols-2">
                  {paginatedSessions.map((session) => {
                  const coach = coaches.find(c => c.id === session.coach_id);
                  const spotsLeft = (session.max_participants || 0) - (session.current_participants || 0);

                  return (
                    <Card key={session.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={coach?.image} />
                              <AvatarFallback>{coach?.name[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <CardTitle className="text-lg">{session.session_name}</CardTitle>
                              <p className="text-sm text-muted-foreground">{coach?.name}</p>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            {/* ✅ Bug #11 FIX: Afficher le type de séance */}
                            <Badge variant="outline" className="text-xs">
                              {session.session_type === 'individuelle' ? '👤 Individuelle' :
                               session.session_type === 'duo' ? '👥 Duo' : '👥👥 Groupe'}
                            </Badge>
                            <Badge variant={spotsLeft > 5 ? "default" : "secondary"}>
                              {spotsLeft} places
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {session.description}
                        </p>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {format(new Date(session.scheduled_date), "EEEE dd MMMM yyyy", { locale: fr })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>{session.start_time} - {session.end_time}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="line-clamp-1">{session.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{session.price_per_person.toLocaleString()} F CFA / personne</span>
                          </div>
                        </div>

                        {user ? (
                          <Button 
                            className="w-full" 
                            onClick={() => handleBookSession(session)}
                            disabled={spotsLeft === 0}
                          >
                            {spotsLeft === 0 ? "Complet" : "S'inscrire à la séance"}
                          </Button>
                        ) : (
                          <Button 
                            variant="outline"
                            className="w-full" 
                            onClick={() => navigate('/login')}
                            disabled={spotsLeft === 0}
                          >
                            {spotsLeft === 0 ? "Complet" : "Se connecter pour s'inscrire"}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              
              {sessionsTotalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setSessionsPage(p => Math.max(1, p - 1))}
                    disabled={sessionsPage === 1}
                  >
                    Précédent
                  </Button>
                  <span className="flex items-center px-4">
                    Page {sessionsPage} sur {sessionsTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setSessionsPage(p => Math.min(sessionsTotalPages, p + 1))}
                    disabled={sessionsPage === sessionsTotalPages}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </>
            )}
          </TabsContent>

          {/* Coaching individuel */}
          <TabsContent value="individual" className="space-y-6">
            {filteredCoaches.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Aucun coach disponible dans cette zone
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {paginatedCoaches.map((coach) => (
                  <Card key={coach.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center gap-3 mb-2">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={coach.image} />
                          <AvatarFallback>{coach.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <CardTitle className="text-lg">{coach.name}</CardTitle>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span>{coach.rating?.toFixed(1) || "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{coach.address}</span>
                      </div>

                      {coach.available ? (
                        <Badge className="bg-green-600">Disponible</Badge>
                      ) : (
                        <Badge variant="secondary">Non disponible</Badge>
                      )}

                      <Button 
                        className="w-full" 
                        onClick={() => handleBookIndividual(coach)}
                        disabled={!coach.available}
                      >
                        Demander un rendez-vous
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {coachesTotalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setCoachesPage(p => Math.max(1, p - 1))}
                    disabled={coachesPage === 1}
                  >
                    Précédent
                  </Button>
                  <span className="flex items-center px-4">
                    Page {coachesPage} sur {coachesTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCoachesPage(p => Math.min(coachesTotalPages, p + 1))}
                    disabled={coachesPage === coachesTotalPages}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Footer />

      {/* Dialogues */}
      {selectedSession && (
        <RegisterSessionDialog
          session={selectedSession}
          open={sessionDialogOpen}
          onOpenChange={(open) => {
            setSessionDialogOpen(open);
            if (!open) setSelectedSession(null);
          }}
        />
      )}

      {selectedCoach && user && (
        <NewAppointmentDialog 
          open={appointmentDialogOpen}
          onOpenChange={(open) => {
            setAppointmentDialogOpen(open);
            if (!open) setSelectedCoach(null);
          }}
          onSubmit={createAppointment.mutateAsync}
          preselectedPractitioner={{
            id: selectedCoach.id,
            name: selectedCoach.name,
            specialty: 'coach_sportif'
          }}
        />
      )}
    </div>
  );
}
