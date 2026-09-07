import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth, errorMessage } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import { z } from "zod";

// Règles de mot de passe harmonisées avec l'inscription
const passwordSchema = z.object({
  password: z.string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .max(100, "Le mot de passe ne peut pas dépasser 100 caractères"),
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
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  
  // Ref pour éviter les doubles exécutions
  const hasCheckedSession = useRef(false);

  useEffect(() => {
    // Éviter les doubles exécutions en mode StrictMode
    if (hasCheckedSession.current) return;
    hasCheckedSession.current = true;

    // Le lien envoyé par l'API est `/reset-password?token=…` ; l'ancien format Supabase (#access_token) est accepté
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const token = queryParams.get('token') || hashParams.get('access_token') || queryParams.get('access_token');
    const errorCode = hashParams.get('error') || queryParams.get('error');
    const errorDescription = hashParams.get('error_description') || queryParams.get('error_description');

    // Gérer les erreurs dans l'URL (token expiré, etc.)
    if (errorCode) {
      const message = errorDescription
        ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
        : "Le lien de réinitialisation est invalide ou a expiré.";
      setError(message);
      setIsLoading(false);
      return;
    }

    if (token) {
      setResetToken(token);
      setIsValidSession(true);
    } else {
      setError("Le lien de réinitialisation est invalide ou a expiré. Veuillez demander un nouveau lien.");
    }
    setIsLoading(false);
  }, []);

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

    try {
      if (!resetToken) {
        throw new Error("Le lien de réinitialisation est invalide ou a expiré.");
      }
      await auth.resetPassword(resetToken, password);

      // Succès - l'API a révoqué les sessions existantes ; rediriger vers la connexion
      await auth.signOut();
      
      toast({
        title: "Mot de passe réinitialisé",
        description: "Connectez-vous avec votre nouveau mot de passe."
      });
      
      navigate("/login-email", { replace: true });
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: errorMessage(err),
        variant: "destructive"
      });
      setIsSubmitting(false);
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

  // Afficher l'erreur si le lien est invalide
  if (error || !isValidSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10">
        <Header />
        <main className="pt-24 pb-12">
          <div className="container mx-auto px-4 max-w-md">
            <Card className="w-full p-6 shadow-medical">
              <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold">Lien expiré</h1>
                <p className="text-muted-foreground text-center mt-2">
                  {error || "Ce lien de réinitialisation n'est plus valide."}
                </p>
              </div>
              
              <div className="space-y-3">
                <Link to="/forgot-password">
                  <Button variant="patient" size="xl" className="w-full">
                    Demander un nouveau lien
                  </Button>
                </Link>
                <Link to="/login-email">
                  <Button variant="outline" className="w-full">
                    Retour à la connexion
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </main>
      </div>
    );
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
                  Doit contenir au moins 8 caractères
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
