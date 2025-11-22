import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  User,
  Bell,
  HelpCircle,
  Users,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { NotificationsSection } from "@/components/dashboard/NotificationsSection";
import { ProfessionalProfileSection } from "@/components/dashboard/practitioner/ProfessionalProfileSection";
import { SupportSection } from "@/components/dashboard/SupportSection";
import { GroupSessionCard } from "@/components/coach/GroupSessionCard";
import { CreateGroupSessionDialog } from "@/components/coach/CreateGroupSessionDialog";
import { EditGroupSessionDialog } from "@/components/coach/EditGroupSessionDialog";
import { useGroupSessions } from "@/hooks/useGroupSessions";

export default function CoachDashboard() {
  const { data: user, isLoading: isLoadingUser } = useSupabaseUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [editingSession, setEditingSession] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Fetch coach profile
  const { data: coach, isLoading: isLoadingCoach } = useQuery({
    queryKey: ['coach-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('user_id', user.id)
        .eq('practitioner_type', 'coach_sportif')
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { sessions, isLoading: isLoadingSessions, cancelSession, confirmSession } = useGroupSessions(coach?.id);

  // Calculate stats
  const upcomingSessions = sessions?.filter(s => 
    s.status === 'planifiee' || s.status === 'confirmee'
  ).length || 0;

  const totalParticipants = sessions?.reduce((sum, s) => 
    sum + (s.current_participants || 0), 0
  ) || 0;

  const totalRevenue = sessions?.filter(s => s.status === 'terminee')
    .reduce((sum, s) => sum + (s.price_per_person * (s.current_participants || 0) * 0.63), 0) || 0;

  const handleEditSession = (sessionId: string) => {
    const session = sessions?.find(s => s.id === sessionId);
    if (session) {
      setEditingSession(session);
      setEditDialogOpen(true);
    }
  };

  const handleCancelSession = (sessionId: string) => {
    if (confirm("Êtes-vous sûr de vouloir annuler cette séance ?")) {
      cancelSession(sessionId);
    }
  };

  const handleConfirmSession = (sessionId: string) => {
    if (confirm("Confirmer cette séance ? Les participants seront notifiés.")) {
      confirmSession(sessionId);
    }
  };

  if (isLoadingUser || isLoadingCoach) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10">
        <Header />
        <main className="pt-24 pb-12">
          <div className="container mx-auto px-4">
            <Card className="max-w-md mx-auto">
              <CardHeader>
                <CardTitle>Profil non trouvé</CardTitle>
                <CardDescription>
                  Votre profil de coach sportif n'a pas été trouvé.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate('/')}>
                  Retour à l'accueil
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/20 to-primary-glow/10">
      <Header />
      
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">
              Bienvenue, Coach {coach.name} 👋
            </h1>
            <p className="text-muted-foreground">
              Gérez vos séances de coaching et suivez vos statistiques
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="shadow-medical">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Séances à venir
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{upcomingSessions}</span>
                  <Calendar className="h-8 w-8 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-medical">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Participants totaux
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{totalParticipants}</span>
                  <Users className="h-8 w-8 text-secondary" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-medical">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenus (net)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold">{Math.round(totalRevenue).toLocaleString()} F</span>
                  <DollarSign className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="sessions" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="sessions" className="gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Séances</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Profil</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="support" className="gap-2">
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Support</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sessions" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold">Mes séances de groupe</h2>
                  <CardDescription>Gérez et créez vos séances de coaching</CardDescription>
                </div>
                <CreateGroupSessionDialog 
                  coachId={coach.id}
                />
              </div>

              {isLoadingSessions ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Chargement des séances...</p>
                </div>
              ) : sessions && sessions.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {sessions.map((session) => (
                    <GroupSessionCard
                      key={session.id}
                      session={session}
                      isCoachView
                      onEdit={handleEditSession}
                      onCancel={handleCancelSession}
                      onConfirm={handleConfirmSession}
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Aucune séance créée pour le moment
                    </p>
                    <CreateGroupSessionDialog 
                      coachId={coach.id}
                    />
                  </CardContent>
                </Card>
              )}

              <EditGroupSessionDialog
                session={editingSession}
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
              />
            </TabsContent>

            <TabsContent value="profile">
              <ProfessionalProfileSection
                practitionerId={coach.id}
                practitionerData={coach}
                isCoach
              />
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationsSection />
            </TabsContent>

            <TabsContent value="support">
              <SupportSection />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}