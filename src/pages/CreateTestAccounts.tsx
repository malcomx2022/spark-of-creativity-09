import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function CreateTestAccounts() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [accounts, setAccounts] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const createAccounts = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-test-users');
      
      if (error) {
        setError(error.message);
        throw error;
      }
      
      console.log('Accounts created:', data);
      setAccounts(data.accounts);
      toast({
        title: "Comptes créés avec succès !",
        description: "Les comptes de test sont maintenant disponibles.",
      });
    } catch (error: any) {
      console.error('Error creating accounts:', error);
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const testLogin = async (email: string, password: string) => {
    setIsTesting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Erreur de connexion",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Connexion réussie !",
        description: `Connecté en tant que ${email}`,
      });

      // Rediriger selon le type de compte
      if (email.includes('admin')) {
        navigate('/admin');
      } else if (email.includes('praticien')) {
        navigate('/dashboard/practitioner');
      } else {
        navigate('/dashboard/patient');
      }
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10 p-8">
      <div className="container mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Créer les comptes de test</CardTitle>
            <CardDescription>
              Cliquez sur le bouton pour créer les comptes de test par défaut
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={createAccounts} 
              disabled={isCreating || isTesting}
              className="w-full"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création en cours...
                </>
              ) : (
                "Créer/Mettre à jour les comptes"
              )}
            </Button>

            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {accounts && (
              <div className="space-y-4 mt-6">
                <h3 className="font-semibold">Comptes disponibles :</h3>
                
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div>
                    <p className="font-medium">Patient</p>
                    <p className="text-sm">Email: {accounts.patient.email}</p>
                    <p className="text-sm">Mot de passe: {accounts.patient.password}</p>
                    <p className="text-xs text-muted-foreground">
                      Statut: {accounts.patient.created ? '✅ Créé' : '⚠️ Existant'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => testLogin(accounts.patient.email, accounts.patient.password)}
                    disabled={isTesting}
                    className="w-full"
                  >
                    Tester connexion Patient
                  </Button>
                </div>

                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div>
                    <p className="font-medium">Praticien</p>
                    <p className="text-sm">Email: {accounts.praticien.email}</p>
                    <p className="text-sm">Mot de passe: {accounts.praticien.password}</p>
                    <p className="text-xs text-muted-foreground">
                      Statut: {accounts.praticien.created ? '✅ Créé' : '⚠️ Existant'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => testLogin(accounts.praticien.email, accounts.praticien.password)}
                    disabled={isTesting}
                    className="w-full"
                  >
                    Tester connexion Praticien
                  </Button>
                </div>

                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div>
                    <p className="font-medium">Admin</p>
                    <p className="text-sm">Email: {accounts.admin.email}</p>
                    <p className="text-sm">Mot de passe: {accounts.admin.password}</p>
                    <p className="text-xs text-muted-foreground">
                      Statut: {accounts.admin.created ? '✅ Créé' : '⚠️ Existant'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => testLogin(accounts.admin.email, accounts.admin.password)}
                    disabled={isTesting}
                    className="w-full"
                  >
                    Tester connexion Admin
                  </Button>
                </div>

                <div className="mt-6 pt-6 border-t">
                  <Button
                    variant="outline"
                    onClick={() => navigate('/login-email')}
                    className="w-full"
                  >
                    Aller à la page de connexion
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
