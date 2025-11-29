import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, User } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_MESSAGES } from "@/lib/auth-constants";
import { navigateToHome, navigateToDashboard } from "@/lib/auth-navigation";
import { withTimeout, NetworkTimeoutError } from "@/lib/network-timeout";

export default function LoginPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        })
      );

      if (error) {
        toast({
          ...AUTH_MESSAGES.LOGIN_ERROR,
          description: error.message || AUTH_MESSAGES.LOGIN_ERROR.defaultDescription,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Vérifier le rôle de l'utilisateur
      const roleResult = await withTimeout<{ data: { role: string } | null }>(
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user.id)
          .maybeSingle() as unknown as Promise<any>
      );

      const practitionerResult = await withTimeout<{ data: { id: string; practitioner_type: string } | null }>(
        supabase
          .from('practitioners')
          .select('id, practitioner_type')
          .eq('user_id', data.user.id)
          .maybeSingle() as unknown as Promise<any>
      );

      toast(AUTH_MESSAGES.LOGIN_SUCCESS);

      // Rediriger selon le rôle
      if (roleResult.data?.role) {
        navigateToDashboard(navigate, 'admin');
      } else if (practitionerResult.data) {
        // Différencier les coachs sportifs
        if (practitionerResult.data.practitioner_type === 'coach_sportif') {
          navigateToDashboard(navigate, 'coach');
        } else {
          navigateToDashboard(navigate, 'practitioner');
        }
      } else {
        navigateToDashboard(navigate, 'patient');
      }

      setIsSubmitting(false);
    } catch (error: any) {
      const isTimeoutError = error instanceof NetworkTimeoutError;
      toast({
        ...AUTH_MESSAGES.LOGIN_ERROR,
        description: isTimeoutError 
          ? error.message 
          : (error.message || AUTH_MESSAGES.LOGIN_ERROR.defaultDescription),
        variant: "destructive"
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10">
      <Header />

      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-md">
          <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigateToHome(navigate)}
            className="mb-4"
          >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-medical">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto gradient-primary rounded-full flex items-center justify-center mb-4">
                <User className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Se connecter</CardTitle>
              <CardDescription>
                Accédez à votre compte pour gérer l'application
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="votre@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Votre mot de passe"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  variant="patient"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Connexion en cours..." : "Se connecter"}
                </Button>

                <div className="text-center space-y-2 pt-4">
                  <Link to="/forgot-password" className="block text-sm text-primary hover:underline">
                    Mot de passe oublié ?
                  </Link>
                  <Link to="/login" className="block text-sm text-primary hover:underline">
                    Se connecter avec numéro de téléphone (OTP)
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}