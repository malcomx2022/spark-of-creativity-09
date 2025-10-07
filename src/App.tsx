import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import PatientSignup from "./pages/PatientSignup";
import PractitionerSignup from "./pages/PractitionerSignup";
import Triage from "./pages/Triage";
import PatientDashboard from "./pages/PatientDashboard";
import PractitionerDashboard from "./pages/PractitionerDashboard";
import PractitionerSearch from "./pages/PractitionerSearch";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/signup/patient" element={<PatientSignup />} />
          <Route path="/signup/practitioner" element={<PractitionerSignup />} />
          <Route path="/triage" element={<Triage />} />
          <Route path="/search-practitioners" element={<PractitionerSearch />} />
          <Route path="/dashboard/patient" element={<PatientDashboard />} />
          <Route path="/dashboard/practitioner" element={<PractitionerDashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
