import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { z } from "zod";

const passwordSchema = z.object({
  password: z.string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Le mot de passe doit contenir au moins une majuscule")
    .regex(/[a-z]/, "Le mot de passe doit contenir au moins une minuscule")
    .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    // Écouter les changements d'auth pour détecter le token de récupération
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event);
        
        if (event === 'PASSWORD_RECOVERY') {
          // Token de récupération valide détecté
          setIsValidSession(true);
        } else if (event === 'SIGNED_IN' && session) {
          // Session établie après clic sur le lien
          setIsValidSession(true);
        }
      }
    );

    // Vérifier si on a déjà une session (utilisateur a cliqué sur le lien)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Vérifier aussi les hash params pour le token de récupération
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (type === 'recovery' && accessToken) {
        // Token de récupération dans l'URL
        setIsValidSession(true);
        setIsLoading(false);
      } else if (session) {
        setIsValidSession(true);
        setIsLoading(false);
      } else {
        // Attendre un peu pour laisser le temps à onAuthStateChange de se déclencher
        setTimeout(() => {
          setIsLoading(false);
          if (!isValidSession) {
            toast({
              title: "Lien invalide ou expiré",
              description: "Ce lien de réinitialisation n'est plus valide. Demandez un nouveau lien.",
              variant: "destructive"
            });
            navigate("/forgot-password");
          }
        }, 2000);
      }
    };
    
    checkSession();

    return () => subscription.unsubscribe();
  }, [navigate, toast, isValidSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation avec Zod
    const validation = passwordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      toast({
        title: "Erreur de validation",
        description: validation.error.issues[0].message,
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
      setIsSubmitting(false);
    } else {
      // Déconnecter l'utilisateur pour qu'il se reconnecte avec son nouveau mot de passe
      await supabase.auth.signOut();
      
      toast({
        title: "Succès",
        description: "Votre mot de passe a été réinitialisé. Connectez-vous avec votre nouveau mot de passe."
      });
      
      // Rediriger vers la page de connexion
      navigate("/login-email", { replace: true });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Vérification du lien...</p>
        </div>
      </div>
    );
  }

  if (!isValidSession) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10">
      <Header />
      
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-md">
          <Card className="w-full p-6 shadow-medical">
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 gradient-primary rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
              <p className="text-muted-foreground text-center mt-2">
                Choisissez un nouveau mot de passe sécurisé
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre
                </p>
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Répétez le mot de passe"
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                variant="patient"
                size="xl"
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
              </Button>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
}
