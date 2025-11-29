import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { UserTypeProvider } from "@/contexts/UserTypeContext";
import Index from "./pages/Index";
import PatientSignup from "./pages/PatientSignup";
import PractitionerSignup from "./pages/PractitionerSignup";
import CoachDashboard from "./pages/CoachDashboard";
import Triage from "./pages/Triage";
import PatientDashboard from "./pages/PatientDashboard";
import PractitionerDashboard from "./pages/PractitionerDashboard";
import PractitionerSearch from "./pages/PractitionerSearch";
import CoachSearch from "./pages/CoachSearch";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import PatientLogin from "./pages/PatientLogin";
import PractitionerLogin from "./pages/PractitionerLogin";
import SignupPage from "./pages/SignupPage";
import LoginWithOTP from "./pages/LoginWithOTP";
import VerifyOTP from "./pages/VerifyOTP";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Services from "./pages/Services";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Contact from "./pages/Contact";
import CreateTestAccounts from "./pages/CreateTestAccounts";
import ConfirmEmail from "./pages/ConfirmEmail";
import RegistrationSuccess from "./pages/RegistrationSuccess";
import CompleteRegistration from "./pages/CompleteRegistration";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <UserTypeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/services" element={<Services />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />
          <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
          <Route path="/login" element={<LoginWithOTP />} />
          <Route path="/login-email" element={<LoginPage />} />
          <Route path="/patient-login" element={<PatientLogin />} />
          <Route path="/practitioner-login" element={<PractitionerLogin />} />
          <Route path="/verify-otp" element={<VerifyOTP />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/confirm-email" element={<ConfirmEmail />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/signup/patient" element={<PatientSignup />} />
          <Route path="/signup/practitioner" element={<PractitionerSignup />} />
          <Route path="/registration-success" element={<RegistrationSuccess />} />
          <Route path="/complete-registration" element={<CompleteRegistration />} />
          <Route path="/triage" element={<Triage />} />
          <Route path="/search-practitioners" element={<PractitionerSearch />} />
          <Route path="/search-coaches" element={<CoachSearch />} />
          <Route path="/create-test-accounts" element={<CreateTestAccounts />} />
          <Route path="/dashboard/patient" element={<ProtectedRoute allowedRoles={['patient']}><PatientDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/practitioner" element={<ProtectedRoute allowedRoles={['practitioner']}><PractitionerDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/coach" element={<ProtectedRoute allowedRoles={['coach']}><CoachDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserTypeProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
