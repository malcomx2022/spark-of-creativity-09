import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Shield } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { auth, errorMessage } from "@/lib/api";

export default function AdminLogin() {
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
      await auth.signInWithPassword({ email: formData.email, password: formData.password });
    } catch (error) {
      toast({
        title: "Erreur lors de la connexion",
        description: errorMessage(error),
        variant: "destructive"
      });
      setIsSubmitting(false);
      return;
    }

    // Vérifier le rôle admin avant redirection (rôles user_roles résolus par l'API)
    const me = await auth.me({ force: true });
    if (!me || me.adminRoles.length === 0) {
      toast({
        title: "Accès refusé",
        description: "Ce compte n'a pas les privilèges administrateur.",
        variant: "destructive"
      });
      await auth.signOut();
      setIsSubmitting(false);
      return;
    }

    toast({
      title: "Connexion réussie !",
      description: "Bienvenue sur le tableau de bord administrateur.",
    });
    navigate("/admin");

    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-destructive/20 to-destructive/5">
      <Header />

      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-md">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-medical border-destructive/20">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto bg-destructive rounded-full flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-destructive">Administration</CardTitle>
              <CardDescription>
                Accès réservé aux administrateurs de la plateforme
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email administrateur *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@domicares.com"
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
                    placeholder="Mot de passe administrateur"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-destructive hover:bg-destructive/90"
                  size="xl"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Connexion en cours..." : "Connexion administrateur"}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                <p>⚠️ Accès sécurisé - Toutes les actions sont enregistrées</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
