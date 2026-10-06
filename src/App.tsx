import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { UserTypeProvider } from "@/contexts/UserTypeContext";
import { Skeleton } from "@/components/ui/skeleton";
import { isolateSessionCache } from "@/lib/api/session-cache";

// Pages critiques chargées immédiatement
import Index from "./pages/Index";
import LoginWithOTP from "./pages/LoginWithOTP";
import NotFound from "./pages/NotFound";

// Lazy loading pour les pages secondaires
const PatientSignup = lazy(() => import("./pages/PatientSignup"));
const PublicRoute = lazy(() => import("./components/PublicRoute"));
const PractitionerSignup = lazy(() => import("./pages/PractitionerSignup"));
const CoachDashboard = lazy(() => import("./pages/CoachDashboard"));
const Triage = lazy(() => import("./pages/Triage"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const PractitionerDashboard = lazy(() => import("./pages/PractitionerDashboard"));
const PractitionerSearch = lazy(() => import("./pages/PractitionerSearch"));
const CoachSearch = lazy(() => import("./pages/CoachSearch"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const PatientLogin = lazy(() => import("./pages/PatientLogin"));
const PractitionerLogin = lazy(() => import("./pages/PractitionerLogin"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const VerifyOTP = lazy(() => import("./pages/VerifyOTP"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const PaymentCallback = lazy(() => import("./pages/PaymentCallback"));
const Services = lazy(() => import("./pages/Services"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Contact = lazy(() => import("./pages/Contact"));
const CreateTestAccounts = lazy(() => import("./pages/CreateTestAccounts"));
const ConfirmEmail = lazy(() => import("./pages/ConfirmEmail"));
const RegistrationSuccess = lazy(() => import("./pages/RegistrationSuccess"));
const CompleteRegistration = lazy(() => import("./pages/CompleteRegistration"));

// Lazy loading pour ProtectedRoute
const ProtectedRoute = lazy(() => import("./components/ProtectedRoute"));

// Skeleton de chargement optimisé
function PageLoadingSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-4 p-6">
        <Skeleton className="h-8 w-1/2 mx-auto" />
        <Skeleton className="h-4 w-3/4 mx-auto" />
        <div className="space-y-3 mt-8">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

// Configuration QueryClient optimisée pour la performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache les données pendant 5 minutes avant de les considérer "stale"
      staleTime: 5 * 60 * 1000,
      // Garde les données en cache pendant 30 minutes
      gcTime: 30 * 60 * 1000,
      // Ne refetch pas automatiquement quand la fenêtre reprend le focus
      refetchOnWindowFocus: false,
      // Retry seulement 1 fois en cas d'erreur
      retry: 1,
      // Délai entre les retries
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      // Retry les mutations une fois
      retry: 1,
    },
  },
});

const stopCacheIsolation = isolateSessionCache(queryClient);
if (import.meta.hot) import.meta.hot.dispose(stopCacheIsolation);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <UserTypeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoadingSkeleton />}>
              <Routes>
                {/* Routes critiques (chargées immédiatement) */}
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<LoginWithOTP />} />
                
                {/* Routes secondaires (lazy loaded) */}
                <Route path="/services" element={<Services />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
                <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                <Route path="/login-email" element={<LoginPage />} />
                <Route path="/patient-login" element={<PatientLogin />} />
                <Route path="/practitioner-login" element={<PractitionerLogin />} />
                <Route path="/verify-otp" element={<VerifyOTP />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/confirm-email" element={<ConfirmEmail />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/signup/patient" element={
                  <PublicRoute>
                    <PatientSignup />
                  </PublicRoute>
                } />
                <Route path="/signup/practitioner" element={
                  <PublicRoute>
                    <PractitionerSignup />
                  </PublicRoute>
                } />
                <Route path="/registration-success" element={<RegistrationSuccess />} />
                <Route path="/complete-registration" element={<CompleteRegistration />} />
                <Route path="/triage" element={<Triage />} />
                <Route path="/search-practitioners" element={<PractitionerSearch />} />
                <Route path="/search-coaches" element={<CoachSearch />} />
                <Route path="/create-test-accounts" element={<CreateTestAccounts />} />
                {/* Retour FedaPay : identifiant du paiement en chemin (FedaPay ajoute ?id=&status=) ; l'ancienne forme reste servie */}
                <Route path="/payment/callback/:paymentId" element={<PaymentCallback />} />
                <Route path="/payment/callback" element={<PaymentCallback />} />
                
                {/* Routes protégées */}
                <Route path="/dashboard/patient" element={
                  <ProtectedRoute allowedRoles={['patient']}>
                    <PatientDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/practitioner" element={
                  <ProtectedRoute allowedRoles={['practitioner']}>
                    <PractitionerDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/coach" element={
                  <ProtectedRoute allowedRoles={['coach']}>
                    <CoachDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                
                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </UserTypeProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
