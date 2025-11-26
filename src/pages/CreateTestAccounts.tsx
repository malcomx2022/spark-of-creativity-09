import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from '@supabase/supabase-js';
import type { CreateTestAccountsResponse } from "@/types/edge-function-responses";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import { toast as sonnerToast } from "sonner";

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
      // Create a supabase client without auth for this specific call
      // This ensures the function is called without authentication headers
      const anonClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          }
        }
      );
      
      const { data, error } = await anonClient.functions.invoke<CreateTestAccountsResponse>('create-test-users');
      
      if (error) {
        setError(error.message);
        throw error;
      }
      
      console.log('Accounts created:', data);
      setAccounts(data?.accounts || []);
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.clear();
      sessionStorage.clear();
      setAccounts(null);
      sonnerToast.success("Session nettoyée avec succès!");
    } catch (error: any) {
      console.error('Logout error:', error);
      sonnerToast.error("Erreur lors du nettoyage de session");
    }
  };

  const testLogin = async (email: string, password: string) => {
    setIsTesting(true);
    try {
      // Nettoyer d'abord toute session existante
      await supabase.auth.signOut();
      localStorage.clear();
      sessionStorage.clear();
      
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

      sonnerToast.success(`Connecté en tant que ${email}`);

      // Rediriger selon le type de compte
      if (email.includes('admin')) {
        navigate('/admin');
      } else if (email.includes('coach')) {
        navigate('/dashboard/coach');
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Comptes de test - Workflow</CardTitle>
                <CardDescription>
                  Créez et testez les comptes pour vérifier le parcours patient/praticien
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                title="Nettoyer toutes les sessions"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Nettoyer
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button 
                onClick={createAccounts} 
                disabled={isCreating || isTesting}
                className="flex-1"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Créer/Actualiser les comptes
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {accounts && (
              <div className="space-y-4 mt-6">
                <div className="bg-primary/10 p-3 rounded-lg">
                  <h3 className="font-semibold text-sm">💡 Workflow de test recommandé :</h3>
                  <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                    <li>Se connecter en tant que <strong>Patient</strong></li>
                    <li>Rechercher un praticien proche via "Recherche"</li>
                    <li>Créer un rendez-vous et payer</li>
                    <li>Se déconnecter puis se connecter en <strong>Praticien</strong></li>
                    <li>Accepter le rendez-vous pour déclencher le paiement</li>
                  </ol>
                </div>
                
                <h3 className="font-semibold">Comptes disponibles :</h3>
                
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-3 border-2 border-blue-200 dark:border-blue-800">
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">👤 Patient</p>
                    <p className="text-sm font-mono">{accounts.patient.email}</p>
                    <p className="text-sm font-mono">{accounts.patient.password}</p>
                    <p className="text-xs text-muted-foreground">
                      {accounts.patient.created ? '✅ Créé' : '⚠️ Existant'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => testLogin(accounts.patient.email, accounts.patient.password)}
                    disabled={isTesting}
                    className="w-full"
                  >
                    Se connecter en Patient
                  </Button>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg space-y-3 border-2 border-green-200 dark:border-green-800">
                  <div>
                    <p className="font-medium text-green-900 dark:text-green-100">🏥 Praticien</p>
                    <p className="text-sm font-mono">{accounts.praticien.email}</p>
                    <p className="text-sm font-mono">{accounts.praticien.password}</p>
                    <p className="text-xs text-muted-foreground">
                      {accounts.praticien.created ? '✅ Créé' : '⚠️ Existant'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => testLogin(accounts.praticien.email, accounts.praticien.password)}
                    disabled={isTesting}
                    className="w-full"
                  >
                    Se connecter en Praticien
                  </Button>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg space-y-3 border-2 border-purple-200 dark:border-purple-800">
                  <div>
                    <p className="font-medium text-purple-900 dark:text-purple-100">💪 Coach Sportif</p>
                    <p className="text-sm font-mono">{accounts.coach.email}</p>
                    <p className="text-sm font-mono">{accounts.coach.password}</p>
                    <p className="text-xs text-muted-foreground">
                      {accounts.coach.created ? '✅ Créé' : '⚠️ Existant'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => testLogin(accounts.coach.email, accounts.coach.password)}
                    disabled={isTesting}
                    className="w-full"
                  >
                    Se connecter en Coach
                  </Button>
                </div>

                <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg space-y-3 border-2 border-orange-200 dark:border-orange-800">
                  <div>
                    <p className="font-medium text-orange-900 dark:text-orange-100">🛡️ Admin</p>
                    <p className="text-sm font-mono">{accounts.admin.email}</p>
                    <p className="text-sm font-mono">{accounts.admin.password}</p>
                    <p className="text-xs text-muted-foreground">
                      {accounts.admin.created ? '✅ Créé' : '⚠️ Existant'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => testLogin(accounts.admin.email, accounts.admin.password)}
                    disabled={isTesting}
                    className="w-full"
                  >
                    Se connecter en Admin
                  </Button>
                </div>

                <div className="mt-6 pt-6 border-t space-y-2">
                  <Button
                    variant="outline"
                    onClick={() => navigate('/search-practitioners')}
                    className="w-full"
                  >
                    🔍 Rechercher un praticien
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/login')}
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
