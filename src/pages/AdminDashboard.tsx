import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { Users, Stethoscope, Calendar, DollarSign, Activity, Shield } from "lucide-react";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    fetchUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

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

        {/* Management Sections */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="shadow-medical">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Gestion des utilisateurs
              </CardTitle>
              <CardDescription>
                Gérer les patients et praticiens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  Voir tous les patients
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Voir tous les praticiens
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Validations en attente
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-medical">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-secondary" />
                Rendez-vous
              </CardTitle>
              <CardDescription>
                Suivi des consultations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  Rendez-vous du jour
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Historique complet
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Annulations
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-medical">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Paiements
              </CardTitle>
              <CardDescription>
                Gestion financière
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  Transactions récentes
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Paiements en attente
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Rapports financiers
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-medical">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-secondary" />
                Système
              </CardTitle>
              <CardDescription>
                Paramètres et maintenance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  Paramètres système
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Logs d'activité
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Maintenance
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}