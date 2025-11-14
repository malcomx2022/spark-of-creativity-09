import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useEffect } from "react";
import { Users, Stethoscope, Calendar, DollarSign, Activity, Shield, FileCheck, AlertTriangle, MessageSquare, BookOpen, Phone } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAdminRole";
import { AdminManagement } from "@/components/admin/AdminManagement";
import { KYCQueue } from "@/components/admin/KYCQueue";
import { AuditLogs } from "@/components/admin/AuditLogs";
import { FinanceSection } from "@/components/admin/FinanceSection";
import { SupportSection } from "@/components/admin/SupportSection";
import { OperationsSection } from "@/components/admin/OperationsSection";
import { ComplianceSection } from "@/components/admin/ComplianceSection";
import { UsersManagementSection } from "@/components/admin/UsersManagementSection";
import { OTPManagementSection } from "@/components/admin/OTPManagementSection";
import { useAdminStats } from "@/hooks/useAdminStats";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useNotifications } from "@/hooks/useNotifications";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useIsAdmin();
  const { data: stats } = useAdminStats();
  const { data: user } = useSupabaseUser();

  useEffect(() => {
    const fetchUser = async () => {
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      }
    };

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, isLoading, navigate]);

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
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

  const statsCards = [
    { title: "Patients", value: stats?.patientsCount || 0, icon: Users, color: "text-primary" },
    { title: "Praticiens", value: stats?.practitionersCount || 0, icon: Stethoscope, color: "text-secondary" },
    { title: "Rendez-vous", value: stats?.appointmentsCount || 0, icon: Calendar, color: "text-primary" },
    { title: "Revenus", value: `${stats?.totalRevenue.toLocaleString() || 0} XOF`, icon: DollarSign, color: "text-secondary" },
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
          {statsCards.map((stat, index) => (
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
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9 gap-1">
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
            <TabsTrigger value="otp">
              <Phone className="h-4 w-4 mr-2" />
              OTP
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
            <UsersManagementSection />
          </TabsContent>

          <TabsContent value="admins">
            <AdminManagement />
          </TabsContent>

          <TabsContent value="kyc">
            <KYCQueue />
          </TabsContent>

          <TabsContent value="operations">
            <OperationsSection />
          </TabsContent>

          <TabsContent value="finance">
            <FinanceSection />
          </TabsContent>

          <TabsContent value="support">
            <SupportSection />
          </TabsContent>

          <TabsContent value="otp">
            <OTPManagementSection />
          </TabsContent>

          <TabsContent value="compliance">
            <ComplianceSection />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogs />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
