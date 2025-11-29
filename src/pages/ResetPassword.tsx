import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);

  useEffect(() => {
    // Vérifier si nous avons une session de récupération valide
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true);
      } else {
        toast({
          title: "Lien invalide",
          description: "Ce lien de réinitialisation n'est plus valide",
          variant: "destructive"
        });
        navigate("/forgot-password");
      }
    });
  }, [navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
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
      toast({
        title: "Succès",
        description: "Votre mot de passe a été réinitialisé"
      });
      
      // Rediriger vers la page de connexion
      setTimeout(() => {
        navigate("/login-email");
      }, 2000);
    }
  };

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
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  required
                  minLength={6}
                />
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
