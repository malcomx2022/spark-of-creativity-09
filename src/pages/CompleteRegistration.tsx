import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, LogOut } from "lucide-react";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [userMetadata, setUserMetadata] = useState<any>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasPractitioner, setHasPractitioner] = useState(false);

  useEffect(() => {
    checkRegistrationStatus();
  }, []);

  const checkRegistrationStatus = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        navigate('/login', { replace: true });
        return;
      }

      setUserMetadata(user.user_metadata);

      // Vérifier si le profil existe
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      setHasProfile(!!profile);

      // Vérifier si le praticien existe
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      setHasPractitioner(!!practitioner);

      // Si tout est OK, rediriger
      if (profile && practitioner) {
        const practitionerType = user.user_metadata?.practitioner_type;
        const dashboardPath = practitionerType === 'coach_sportif' 
          ? '/dashboard/coach' 
          : '/dashboard/practitioner';
        navigate(dashboardPath, { replace: true });
      }
    } catch (error) {
      console.error('Erreur vérification statut:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const handleRetrySignup = () => {
    toast({
      title: "Nouvelle inscription",
      description: "Vous allez être déconnecté. Veuillez utiliser un autre numéro de téléphone.",
    });
    setTimeout(() => {
      supabase.auth.signOut();
      navigate('/practitioner-signup', { replace: true });
    }, 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <div className="container mx-auto px-3 sm:px-4 py-8 sm:py-12 md:py-16 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="w-full max-w-2xl border-2 shadow-lg">
          <CardHeader className="text-center space-y-3 sm:space-y-4 pb-6 sm:pb-8 px-4 sm:px-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-warning/10 p-3 sm:p-4">
                <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-warning" />
              </div>
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-bold">
              Inscription incomplète
            </CardTitle>
            <CardDescription className="text-base sm:text-lg px-2">
              Votre compte n'a pas pu être créé complètement
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {!hasProfile && !hasPractitioner && (
                  <>
                    <p className="font-semibold mb-2">Votre compte email existe mais votre profil praticien n'a pas pu être créé.</p>
                    <p className="text-sm">
                      Ceci peut arriver si :
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                      <li>Le numéro de téléphone est déjà utilisé par un autre compte</li>
                      <li>L'email est déjà utilisé</li>
                      <li>Un problème technique est survenu</li>
                    </ul>
                  </>
                )}
                {hasProfile && !hasPractitioner && (
                  <>
                    <p className="font-semibold mb-2">Votre profil de base existe mais votre profil praticien n'a pas été créé.</p>
                    <p className="text-sm">
                      Veuillez contacter le support pour finaliser votre inscription.
                    </p>
                  </>
                )}
              </AlertDescription>
            </Alert>

            <div className="space-y-4 bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold">Solutions possibles :</h4>
              <ol className="space-y-2 ml-4">
                <li className="text-sm text-muted-foreground">
                  <span className="font-semibold">1. Réessayer avec d'autres informations :</span> Utilisez un autre numéro de téléphone et/ou email
                </li>
                <li className="text-sm text-muted-foreground">
                  <span className="font-semibold">2. Vérifier vos informations :</span> Assurez-vous de ne pas déjà avoir un compte patient avec ces coordonnées
                </li>
                <li className="text-sm text-muted-foreground">
                  <span className="font-semibold">3. Contacter le support :</span> Notre équipe peut vous aider à résoudre le problème
                </li>
              </ol>
            </div>

            {userMetadata?.pending_practitioner_data && (
              <Alert>
                <AlertDescription>
                  <p className="text-sm">
                    Vos données d'inscription ont été sauvegardées. Vous pouvez contacter le support qui pourra les récupérer.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="pt-4 border-t space-y-3">
              <Button 
                className="w-full min-h-[48px] text-base"
                size="lg"
                onClick={handleRetrySignup}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Réessayer l'inscription avec de nouvelles informations
              </Button>
              
              <Button 
                className="w-full min-h-[48px] text-base"
                size="lg"
                variant="outline"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Me déconnecter
              </Button>
              
              <p className="text-xs sm:text-sm text-center text-muted-foreground">
                Besoin d'aide ? Contactez-nous à support@domicares.com
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}