import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import type { CreatePractitionerResponse } from "@/types/edge-function-responses";
import {
  getPendingRegistration,
  clearPendingRegistration,
  PendingRegistration
} from "@/lib/registration-recovery";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type CompletionStatus = 'checking' | 'no_pending' | 'ready' | 'processing' | 'success' | 'error';

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<CompletionStatus>('checking');
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);

  useEffect(() => {
    checkRegistrationStatus();
  }, []);

  const checkRegistrationStatus = async () => {
    setStatus('checking');

    try {
      // 1. Vérifier s'il y a une inscription en attente
      const pending = getPendingRegistration();

      // 2. Vérifier si l'utilisateur est connecté
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        // Pas connecté - rediriger vers la connexion
        if (pending) {
          toast({
            title: "Connexion requise",
            description: "Veuillez vous connecter pour finaliser votre inscription.",
          });
          navigate('/login?recovery=true');
        } else {
          navigate('/');
        }
        return;
      }

      setCurrentUser({ id: user.id, email: user.email || '' });

      // 3. Vérifier si le profil praticien existe déjà
      const { data: practitioner, error: practitionerError } = await supabase
        .from('practitioners')
        .select('id, kyc_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (practitioner) {
        // Profil existe déjà - tout va bien
        clearPendingRegistration();
        const dashboardPath = pending?.practitionerType === 'coach_sportif'
          ? '/dashboard/coach'
          : '/dashboard/practitioner';
        navigate(dashboardPath, { replace: true });
        return;
      }

      // 4. Pas de profil praticien - vérifier si on a des données en attente
      if (pending && pending.userId === user.id) {
        setPendingRegistration(pending);
        setStatus('ready');
      } else if (pending && pending.email.toLowerCase() === user.email?.toLowerCase()) {
        // L'email correspond mais pas le userId - données obsolètes
        // Mettre à jour le userId dans les données en attente
        const updatedPending = { ...pending, userId: user.id };
        setPendingRegistration(updatedPending);
        setStatus('ready');
      } else {
        // Pas de données en attente correspondantes
        setStatus('no_pending');
      }
    } catch (error) {
      console.error('Erreur vérification statut:', error);
      setStatus('error');
      setErrorMessage('Erreur lors de la vérification du statut');
    }
  };

  const handleCompleteRegistration = async () => {
    if (!pendingRegistration || !currentUser) return;

    setStatus('processing');
    setErrorMessage('');

    try {
      // Appeler l'edge function avec les données sauvegardées
      const result = await invokeEdgeFunctionWithRetry<CreatePractitionerResponse>(
        'create-practitioner-account',
        {
          body: {
            userId: currentUser.id,
            profileData: pendingRegistration.profileData,
            practitionerData: pendingRegistration.practitionerData,
            documents: pendingRegistration.documents
          }
        }
      );

      if (result.error || (result.data && !result.data.success)) {
        const errorMsg = result.error?.message || result.data?.error || 'Erreur lors de la finalisation';
        setErrorMessage(errorMsg);
        setStatus('error');

        toast({
          title: "Erreur",
          description: errorMsg,
          variant: "destructive"
        });
        return;
      }

      // Succès
      clearPendingRegistration();
      setStatus('success');

      toast({
        title: "Inscription finalisée !",
        description: "Votre profil praticien a été créé avec succès.",
      });

      // Rediriger vers le dashboard
      setTimeout(() => {
        const dashboardPath = pendingRegistration.practitionerType === 'coach_sportif'
          ? '/dashboard/coach'
          : '/dashboard/practitioner';
        navigate(dashboardPath, { replace: true });
      }, 2000);

    } catch (error) {
      console.error('Erreur finalisation:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Une erreur est survenue');
      setStatus('error');
    }
  };

  const handleCancelRecovery = () => {
    clearPendingRegistration();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />

      <div className="container mx-auto px-4 py-16 flex items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Finaliser votre inscription</CardTitle>
            <CardDescription>
              Votre compte a été créé mais l'inscription n'a pas été complétée
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {status === 'checking' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Vérification de votre inscription...</p>
              </div>
            )}

            {status === 'no_pending' && (
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Aucune inscription en attente</AlertTitle>
                  <AlertDescription>
                    Nous n'avons pas trouvé d'inscription incomplète pour votre compte.
                    {currentUser && (
                      <span className="block mt-2">
                        Connecté en tant que: <strong>{currentUser.email}</strong>
                      </span>
                    )}
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour à l'accueil
                  </Button>
                  <Button onClick={() => navigate('/practitioner/signup')} className="flex-1">
                    Nouvelle inscription
                  </Button>
                </div>
              </div>
            )}

            {status === 'ready' && pendingRegistration && (
              <div className="space-y-4">
                <Alert className="border-orange-500/50 bg-orange-500/10">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <AlertTitle className="text-orange-600">Inscription incomplète détectée</AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    <p>Nous avons trouvé une inscription en cours pour :</p>
                    <ul className="mt-2 space-y-1">
                      <li><strong>Email :</strong> {pendingRegistration.email}</li>
                      <li><strong>Type :</strong> {pendingRegistration.practitionerType || 'Praticien'}</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleCancelRecovery} className="flex-1">
                    Annuler
                  </Button>
                  <Button onClick={handleCompleteRegistration} className="flex-1">
                    Finaliser l'inscription
                  </Button>
                </div>
              </div>
            )}

            {status === 'processing' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Finalisation de votre inscription...</p>
                <p className="text-xs text-muted-foreground">Cela peut prendre quelques instants</p>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="rounded-full bg-green-500/10 p-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-lg">Inscription finalisée !</h3>
                  <p className="text-muted-foreground">Redirection vers votre tableau de bord...</p>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Erreur</AlertTitle>
                  <AlertDescription>
                    {errorMessage || "Une erreur est survenue lors de la finalisation."}
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleCancelRecovery} className="flex-1">
                    Annuler
                  </Button>
                  <Button onClick={handleCompleteRegistration} className="flex-1">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Réessayer
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
