import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import PatientSignup from "./pages/PatientSignup";
import PractitionerSignup from "./pages/PractitionerSignup";
import CoachDashboard from "./pages/CoachDashboard";
import Triage from "./pages/Triage";
import PatientDashboard from "./pages/PatientDashboard";
import PractitionerDashboard from "./pages/PractitionerDashboard";
import PractitionerSearch from "./pages/PractitionerSearch";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import LoginWithOTP from "./pages/LoginWithOTP";
import VerifyOTP from "./pages/VerifyOTP";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Services from "./pages/Services";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Contact from "./pages/Contact";
import CreateTestAccounts from "./pages/CreateTestAccounts";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
          <Route path="/verify-otp" element={<VerifyOTP />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/signup/patient" element={<PatientSignup />} />
          <Route path="/signup/practitioner" element={<PractitionerSignup />} />
          <Route path="/triage" element={<Triage />} />
          <Route path="/search-practitioners" element={<PractitionerSearch />} />
          <Route path="/create-test-accounts" element={<CreateTestAccounts />} />
          <Route path="/dashboard/patient" element={<ProtectedRoute><PatientDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/practitioner" element={<ProtectedRoute><PractitionerDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/coach" element={<ProtectedRoute><CoachDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
