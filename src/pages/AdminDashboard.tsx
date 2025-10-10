import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { Users, Stethoscope, Calendar, DollarSign, Activity, Shield, FileCheck, AlertTriangle, MessageSquare, BookOpen } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAdminRole";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { KYCQueue } from "@/components/admin/KYCQueue";
import { AuditLogs } from "@/components/admin/AuditLogs";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const { isAdmin, isLoading } = useIsAdmin();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    fetchUser();
  }, []);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, isLoading, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-destructive/10 to-destructive/5">
        <Header />
        <main className="container mx-auto p-4 mt-20">
          <div className="text-center py-8">Chargement...</div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const stats = [
    { title: "Patients", value: "1,234", icon: Users, color: "text-primary" },
    { title: "Praticiens", value: "156", icon: Stethoscope, color: "text-secondary" },
    { title: "Rendez-vous", value: "89", icon: Calendar, color: "text-primary" },
    { title: "Revenus", value: "45,678 XOF", icon: DollarSign, color: "text-secondary" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-destructive/10 to-destructive/5">
      <Header />
      <main className="container mx-auto p-4 mt-20">
        <div className="mb-8">
          <Card className="shadow-medical border-destructive/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-destructive rounded-full flex items-center justify-center">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Tableau de bord administrateur</CardTitle>
                    <CardDescription>
                      Bienvenue, {user?.email || 'administrateur'}
                    </CardDescription>
                  </div>
                </div>
                <Button onClick={handleLogout} variant="outline">
                  Se déconnecter
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Statistics Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="shadow-medical">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription>{stat.title}</CardDescription>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Admin Interface */}
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
            <TabsTrigger value="dashboard">
              <Activity className="h-4 w-4 mr-2" />
              Vue d'ensemble
            </TabsTrigger>
            <TabsTrigger value="admins">
              <Shield className="h-4 w-4 mr-2" />
              Admins
            </TabsTrigger>
            <TabsTrigger value="kyc">
              <FileCheck className="h-4 w-4 mr-2" />
              KYC
            </TabsTrigger>
            <TabsTrigger value="operations">
              <Calendar className="h-4 w-4 mr-2" />
              Opérations
            </TabsTrigger>
            <TabsTrigger value="finance">
              <DollarSign className="h-4 w-4 mr-2" />
              Finance
            </TabsTrigger>
            <TabsTrigger value="support">
              <MessageSquare className="h-4 w-4 mr-2" />
              Support
            </TabsTrigger>
            <TabsTrigger value="compliance">
              <BookOpen className="h-4 w-4 mr-2" />
              Conformité
            </TabsTrigger>
            <TabsTrigger value="audit">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Gestion des utilisateurs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start">
                      Voir tous les patients
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      Voir tous les praticiens
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-secondary" />
                    Rendez-vous
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start">
                      Rendez-vous du jour
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      Historique complet
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="admins">
            <AdminManagement />
          </TabsContent>

          <TabsContent value="kyc">
            <KYCQueue />
          </TabsContent>

          <TabsContent value="operations">
            <Card>
              <CardHeader>
                <CardTitle>Opérations en temps réel</CardTitle>
                <CardDescription>Suivi des rendez-vous et incidents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  À implémenter : Carte temps réel, modération avis, gestion litiges
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="finance">
            <Card>
              <CardHeader>
                <CardTitle>Gestion financière</CardTitle>
                <CardDescription>Transactions, reversements, remboursements</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  À implémenter : Liste transactions, payouts, réconciliation
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="support">
            <Card>
              <CardHeader>
                <CardTitle>Support client</CardTitle>
                <CardDescription>Tickets et base de connaissances</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  À implémenter : File tickets, FAQ, guides
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance">
            <Card>
              <CardHeader>
                <CardTitle>Conformité & paramètres</CardTitle>
                <CardDescription>CGU, consents, configuration système</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  À implémenter : Gestion CGU, paramètres triage, intégrations
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogs />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
