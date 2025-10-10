import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function CreateTestAccounts() {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [accounts, setAccounts] = useState<any>(null);

  const createAccounts = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-test-users');
      
      if (error) throw error;
      
      setAccounts(data.accounts);
      toast({
        title: "Comptes créés avec succès !",
        description: "Les comptes de test sont maintenant disponibles.",
      });
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
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
              disabled={isCreating}
              className="w-full"
            >
              {isCreating ? "Création en cours..." : "Créer les comptes"}
            </Button>

            {accounts && (
              <div className="space-y-4 mt-6">
                <h3 className="font-semibold">Comptes créés :</h3>
                
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">Patient</p>
                  <p className="text-sm">Email: {accounts.patient.email}</p>
                  <p className="text-sm">Mot de passe: {accounts.patient.password}</p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">Praticien</p>
                  <p className="text-sm">Email: {accounts.praticien.email}</p>
                  <p className="text-sm">Mot de passe: {accounts.praticien.password}</p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">Admin</p>
                  <p className="text-sm">Email: {accounts.admin.email}</p>
                  <p className="text-sm">Mot de passe: {accounts.admin.password}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
