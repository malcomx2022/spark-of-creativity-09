import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { auth } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useDashboardTab } from "@/hooks/useDashboardTab";
import { Users, Stethoscope, Calendar, DollarSign, Activity, Shield, FileCheck, AlertTriangle, MessageSquare, BookOpen, Phone, Settings, Loader2, Webhook, Search, GraduationCap } from "lucide-react";
import { useAcademyEnabled } from "@/hooks/useAcademy";
import { useIsAdmin } from "@/hooks/useAdminRole";
import { useAdminStats } from "@/hooks/useAdminStats";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useNotifications, useMarkNotificationAsRead } from "@/hooks/useNotifications";
import { Badge } from "@/components/ui/badge";

// Lazy load admin sections
const UsersManagementSection = lazy(() => import("@/components/admin/UsersManagementSection").then(m => ({ default: m.UsersManagementSection })));
const AdminManagement = lazy(() => import("@/components/admin/AdminManagement").then(m => ({ default: m.AdminManagement })));
const KYCQueue = lazy(() => import("@/components/admin/KYCQueue").then(m => ({ default: m.KYCQueue })));
const OperationsSection = lazy(() => import("@/components/admin/OperationsSection").then(m => ({ default: m.OperationsSection })));
const FinanceSection = lazy(() => import("@/components/admin/FinanceSection").then(m => ({ default: m.FinanceSection })));
const SupportSection = lazy(() => import("@/components/admin/SupportSection").then(m => ({ default: m.SupportSection })));
const OTPManagementSection = lazy(() => import("@/components/admin/OTPManagementSection").then(m => ({ default: m.OTPManagementSection })));
const ApiManagementSection = lazy(() => import("@/components/admin/ApiManagementSection").then(m => ({ default: m.ApiManagementSection })));
const ComplianceSection = lazy(() => import("@/components/admin/ComplianceSection").then(m => ({ default: m.ComplianceSection })));
const AuditLogs = lazy(() => import("@/components/admin/AuditLogs").then(m => ({ default: m.AuditLogs })));
const WebhooksSection = lazy(() => import("@/components/admin/WebhooksSection").then(m => ({ default: m.WebhooksSection })));
const WebhookConfig = lazy(() => import("@/components/admin/WebhookConfig").then(m => ({ default: m.WebhookConfig })));
const SandboxPaymentTester = lazy(() => import("@/components/admin/SandboxPaymentTester").then(m => ({ default: m.SandboxPaymentTester })));
const SearchActivitySection = lazy(() => import("@/components/admin/SearchActivitySection"));
const AcademyAdminSection = lazy(() => import("@/components/admin/AcademyAdminSection").then(m => ({ default: m.AcademyAdminSection })));

const ADMIN_TABS = ["dashboard", "admins", "kyc", "operations", "finance", "support", "otp", "api", "compliance", "audit", "webhooks", "search-activity", "academy"] as const;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isLoading, role } = useIsAdmin();
  const { data: stats } = useAdminStats();
  const { data: user } = useAuthUser();
  const userId = user?.id;
  // P2 #20: Récupérer uniquement les notifications non lues pour éviter surcharge
  const { data: allNotifications = [] } = useNotifications(isAdmin ? userId : undefined);
  // Filtrer les notifications KYC non lues en priorité
  const notifications = allNotifications
    .filter(n => n.type === 'kyc_pending' || !n.is_read)
    .slice(0, 100);
  const markNotificationAsRead = useMarkNotificationAsRead();
  const processedKycNotifications = useRef(new Set<string>());
  const canManageAdmins = role === "super_admin";
  // Onglet lié à l'URL (/admin?tab=kyc des notifications, retour après connexion, bouton Retour).
  // Onglet Academy affiché seulement quand l'API annonce l'intégration Akambi activée.
  const { data: academyEnabled = false } = useAcademyEnabled();
  const adminTabs = useMemo(() => ADMIN_TABS.filter(tab => (tab !== "admins" || canManageAdmins) && (tab !== "academy" || academyEnabled)), [canManageAdmins, academyEnabled]);
  const [activeTab, setActiveTab] = useDashboardTab(adminTabs, "dashboard");

  const unreadKycNotifications = notifications.filter((notification) =>
    notification.type === 'kyc_pending' && !notification.is_read
  );
  const pendingKycNotifications = unreadKycNotifications.length;

  useEffect(() => {
    if (activeTab !== "kyc" || unreadKycNotifications.length === 0 || !userId) {
      return;
    }

    unreadKycNotifications.forEach((notification) => {
      if (processedKycNotifications.current.has(notification.id)) {
        return;
      }

      processedKycNotifications.current.add(notification.id);
      markNotificationAsRead.mutate({ notificationId: notification.id, userId });
    });
  }, [activeTab, unreadKycNotifications, markNotificationAsRead, userId]);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, isLoading, navigate]);

  const handleLogout = async () => {
    // Nettoyer complètement la session
    await auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "/";
  };

  // P3: Use consistent loading indicator with spinner
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-destructive/10 to-destructive/5">
        <Header />
        <main className="container mx-auto p-4 mt-20">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const totalRevenueValue = stats?.totalRevenue ?? 0;

  const statsCards = [
    { title: "Patients", value: stats?.patientsCount || 0, icon: Users, color: "text-primary" },
    { title: "Praticiens", value: stats?.practitionersCount || 0, icon: Stethoscope, color: "text-secondary" },
    { title: "Rendez-vous", value: stats?.appointmentsCount || 0, icon: Calendar, color: "text-primary" },
    { title: "Revenus", value: `${totalRevenueValue.toLocaleString("fr-FR")} XOF`, icon: DollarSign, color: "text-secondary" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-destructive/10 to-destructive/5">
      <Header />
      <main className="container mx-auto p-4 mt-20">
        <div className="mb-8">
          <Card className="shadow-medical border-destructive/20">
            <CardHeader>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-12 h-12 bg-destructive rounded-full flex items-center justify-center">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Tableau de bord administrateur</CardTitle>
                    <CardDescription className="break-all">
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-auto min-w-full justify-start lg:grid lg:w-full lg:grid-cols-13 gap-1">
              <TabsTrigger value="dashboard" className="whitespace-nowrap">
                <Activity className="h-4 w-4 mr-2" />
                Vue d'ensemble
              </TabsTrigger>
              {canManageAdmins && (
                <TabsTrigger value="admins" className="whitespace-nowrap">
                  <Shield className="h-4 w-4 mr-2" />
                  Admins
                </TabsTrigger>
              )}
              <TabsTrigger value="kyc" className="flex items-center gap-2 whitespace-nowrap">
                <FileCheck className="h-4 w-4" />
                <span>KYC</span>
                {pendingKycNotifications > 0 && (
                  <Badge variant="destructive" className="ml-1">
                    {pendingKycNotifications > 99 ? '99+' : pendingKycNotifications}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="operations" className="whitespace-nowrap">
                <Calendar className="h-4 w-4 mr-2" />
                Opérations
              </TabsTrigger>
              <TabsTrigger value="finance" className="whitespace-nowrap">
                <DollarSign className="h-4 w-4 mr-2" />
                Finance
              </TabsTrigger>
              <TabsTrigger value="support" className="whitespace-nowrap">
                <MessageSquare className="h-4 w-4 mr-2" />
                Support
              </TabsTrigger>
              <TabsTrigger value="otp" className="whitespace-nowrap">
                <Phone className="h-4 w-4 mr-2" />
                OTP
              </TabsTrigger>
              <TabsTrigger value="api" className="whitespace-nowrap">
                <Settings className="h-4 w-4 mr-2" />
                API
              </TabsTrigger>
              <TabsTrigger value="compliance" className="whitespace-nowrap">
                <BookOpen className="h-4 w-4 mr-2" />
                Conformité
              </TabsTrigger>
              <TabsTrigger value="audit" className="whitespace-nowrap">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Audit
              </TabsTrigger>
              <TabsTrigger value="webhooks" className="whitespace-nowrap">
                <Webhook className="h-4 w-4 mr-2" />
                Webhooks
              </TabsTrigger>
              <TabsTrigger value="search-activity" className="whitespace-nowrap">
                <Search className="h-4 w-4 mr-2" />
                Recherches
              </TabsTrigger>
              {academyEnabled && (
                <TabsTrigger value="academy" className="whitespace-nowrap">
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Academy
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* P2 #19: Wrapping lazy-loaded components with ErrorBoundary */}
          <TabsContent value="dashboard" className="space-y-4">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <UsersManagementSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          {canManageAdmins && (
            <TabsContent value="admins">
              <ErrorBoundary>
                <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                  <AdminManagement />
                </Suspense>
              </ErrorBoundary>
            </TabsContent>
          )}

          <TabsContent value="kyc">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <KYCQueue />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="operations">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <OperationsSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="finance">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <FinanceSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="support">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <SupportSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="otp">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <OTPManagementSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="api">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <ApiManagementSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="compliance">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <ComplianceSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="audit">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <AuditLogs />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <WebhookConfig />
                <SandboxPaymentTester />
                <WebhooksSection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="search-activity">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <SearchActivitySection />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          {academyEnabled && (
            <TabsContent value="academy">
              <ErrorBoundary>
                <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                  <AcademyAdminSection />
                </Suspense>
              </ErrorBoundary>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
