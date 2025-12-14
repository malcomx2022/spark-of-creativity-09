import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, LogOut, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import type { CreatePractitionerResponse } from "@/types/edge-function-responses";

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [userMetadata, setUserMetadata] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
      setUserId(user.id);

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
        .select('id, practitioner_type')
        .eq('user_id', user.id)
        .maybeSingle();

      setHasPractitioner(!!practitioner);

      // Si tout est OK, rediriger
      if (profile && practitioner) {
        const practitionerType = practitioner.practitioner_type || user.user_metadata?.practitioner_type;
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

  const handleRetryWithSavedData = async () => {
    if (!userId || !userMetadata?.pending_practitioner_data) {
      toast({
        title: "Données non disponibles",
        description: "Les données d'inscription ne sont pas disponibles. Veuillez créer un nouveau compte.",
        variant: "destructive"
      });
      return;
    }

    setIsRetrying(true);

    try {
      const pendingData = userMetadata.pending_practitioner_data;
      
      // Vérifier si les documents sont nécessaires
      if (pendingData.needsDocumentUpload) {
        // Les documents n'ont pas été sauvegardés - rediriger vers le formulaire
        toast({
          title: "Documents requis",
          description: "Vous devez soumettre à nouveau vos documents. Redirection vers le formulaire...",
          variant: "destructive"
        });
        
        // Sauvegarder un flag pour pré-remplir le formulaire
        await supabase.auth.updateUser({
          data: {
            prefill_signup_data: pendingData,
          }
        });
        
        setTimeout(async () => {
          await supabase.auth.signOut();
          navigate('/signup/practitioner?prefill=true', { replace: true });
        }, 2000);
        return;
      }
      
      // Appeler l'edge function pour créer le profil praticien
      const { data: createResult, error: createError } = await invokeEdgeFunctionWithRetry<CreatePractitionerResponse>(
        'create-practitioner-account',
        {
          body: {
            userId,
            profileData: pendingData.profileData,
            practitionerData: pendingData.practitionerData,
            documents: pendingData.documents || {},
          }
        }
      );

      if (createError || !createResult?.success) {
        throw new Error(createError?.message || createResult?.error || "Échec de la création du compte");
      }

      // Nettoyer les données pendantes
      await supabase.auth.updateUser({
        data: {
          pending_practitioner_data: null,
        }
      });

      toast({
        title: "Inscription finalisée !",
        description: "Votre compte praticien a été créé avec succès.",
      });

      // Rediriger vers le dashboard
      const practitionerType = pendingData.practitionerData?.practitioner_type;
      const dashboardPath = practitionerType === 'coach_sportif' 
        ? '/dashboard/coach' 
        : '/dashboard/practitioner';
      navigate(dashboardPath, { replace: true });

    } catch (error: any) {
      console.error('Erreur lors de la reprise:', error);
      
      // Si c'est une erreur de documents manquants, proposer de réinscrire
      const errorMessage = error.message?.toLowerCase() || '';
      if (errorMessage.includes('document') || errorMessage.includes('pièce') || errorMessage.includes('diplôme')) {
        toast({
          title: "Documents requis",
          description: "Les documents sont manquants. Veuillez créer un nouveau compte pour soumettre vos documents.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erreur",
          description: error.message || "Impossible de finaliser l'inscription. Veuillez réessayer.",
          variant: "destructive"
        });
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const handleRetrySignup = () => {
    toast({
      title: "Nouvelle inscription",
      description: "Vous allez être déconnecté pour créer un nouveau compte.",
    });
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate('/signup/practitioner', { replace: true });
    }, 1500);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const hasPendingData = userMetadata?.pending_practitioner_data;
  const isPractitionerType = userMetadata?.user_type === 'practitioner';

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
              {isPractitionerType 
                ? "Votre compte praticien n'a pas pu être créé complètement"
                : "Votre compte n'a pas pu être créé complètement"
              }
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
                      <li>Un problème de connexion est survenu lors de l'envoi des documents</li>
                      <li>Un problème technique temporaire est survenu</li>
                    </ul>
                  </>
                )}
                {hasProfile && !hasPractitioner && (
                  <>
                    <p className="font-semibold mb-2">Votre profil de base existe mais votre profil praticien n'a pas été créé.</p>
                    <p className="text-sm">
                      Cliquez sur "Réessayer" ci-dessous ou contactez le support si le problème persiste.
                    </p>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {hasPendingData && (
              <Alert className="bg-primary/5 border-primary/20">
                <AlertDescription>
                  <p className="font-semibold text-primary">✓ Vos données d'inscription ont été sauvegardées</p>
                  <p className="text-sm mt-1">
                    Cliquez sur "Finaliser mon inscription" pour réessayer avec vos données sauvegardées.
                    {hasPendingData.needsDocumentUpload && (
                      <span className="block mt-1 text-muted-foreground">
                        Note: Vous devrez peut-être soumettre à nouveau vos documents.
                      </span>
                    )}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4 bg-muted/50 rounded-lg p-4">
              <h4 className="font-semibold">Solutions possibles :</h4>
              <ol className="space-y-2 ml-4">
                {hasPendingData && (
                  <li className="text-sm text-muted-foreground">
                    <span className="font-semibold text-primary">1. Finaliser avec vos données sauvegardées :</span> Cliquez sur le bouton ci-dessous
                  </li>
                )}
                <li className="text-sm text-muted-foreground">
                  <span className="font-semibold">{hasPendingData ? '2' : '1'}. Créer un nouveau compte :</span> Utilisez un autre numéro de téléphone et/ou email
                </li>
                <li className="text-sm text-muted-foreground">
                  <span className="font-semibold">{hasPendingData ? '3' : '2'}. Contacter le support :</span> Notre équipe peut vous aider à résoudre le problème
                </li>
              </ol>
            </div>

            <div className="pt-4 border-t space-y-3">
              {hasPendingData && (
                <Button 
                  className="w-full min-h-[48px] text-base"
                  size="lg"
                  onClick={handleRetryWithSavedData}
                  disabled={isRetrying}
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Finalisation en cours...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Finaliser mon inscription
                    </>
                  )}
                </Button>
              )}
              
              <Button 
                className="w-full min-h-[48px] text-base"
                size="lg"
                variant={hasPendingData ? "outline" : "default"}
                onClick={handleRetrySignup}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Créer un nouveau compte praticien
              </Button>
              
              <Button 
                className="w-full min-h-[48px] text-base"
                size="lg"
                variant="ghost"
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
