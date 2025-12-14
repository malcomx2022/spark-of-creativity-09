import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_MESSAGES } from "@/lib/auth-constants";
import { navigateToHome, navigateToDashboard } from "@/lib/auth-navigation";
import { withTimeout, NetworkTimeoutError } from "@/lib/network-timeout";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email invalide").max(255, "Email trop long"),
  password: z.string().min(1, "Mot de passe requis"),
});

export default function PractitionerLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation des données
    const validation = loginSchema.safeParse(formData);
    if (!validation.success) {
      toast({
        title: "Erreur de validation",
        description: validation.error.issues[0].message,
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: formData.email.trim().toLowerCase(),
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

      // Vérifier si l'utilisateur est admin
      const { data: roleData } = await withTimeout(
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user.id)
          .maybeSingle()
      );

      // Si admin, autoriser la connexion
      if (roleData?.role === 'super_admin') {
        toast(AUTH_MESSAGES.LOGIN_SUCCESS);
        navigate('/admin', { replace: true });
        setIsSubmitting(false);
        return;
      }

      // Vérifier que l'utilisateur est bien un praticien
      const { data: practitionerData, error: practitionerError } = await withTimeout(
        supabase
          .from('practitioners')
          .select('id, practitioner_type')
          .eq('user_id', data.user.id)
          .maybeSingle()
      );

      if (practitionerError || !practitionerData) {
        // Ce compte n'est pas un praticien valide
        toast({
          title: "Erreur de connexion",
          description: "Ce compte n'est pas un compte praticien valide. Si vous êtes un praticien, veuillez créer un nouveau compte.",
          variant: "destructive"
        });
        await supabase.auth.signOut();
        setIsSubmitting(false);
        return;
      }

      toast(AUTH_MESSAGES.LOGIN_SUCCESS);
      
      // Rediriger selon le type de praticien
      if (practitionerData.practitioner_type === 'coach_sportif') {
        navigateToDashboard(navigate, 'coach');
      } else {
        navigateToDashboard(navigate, 'practitioner');
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
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/20">
      <Header />

      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-md">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/login-email")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-elegant border-primary/20">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto gradient-primary rounded-full flex items-center justify-center mb-4 shadow-glow">
                <Stethoscope className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Connexion Praticien
              </CardTitle>
              <CardDescription>
                Accédez à votre espace professionnel
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
                    className="border-primary/20 focus:border-primary"
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
                    className="border-primary/20 focus:border-primary"
                  />
                </div>

                <Button
                  type="submit"
                  variant="practitioner"
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
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">
                      Pas encore de compte praticien ?
                    </p>
                    <Link to="/signup/practitioner">
                      <Button variant="outline" className="w-full">
                        Créer un compte praticien
                      </Button>
                    </Link>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
