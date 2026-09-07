import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail, Clock, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import Header from "@/components/Header";
import { auth, errorMessage } from "@/lib/api";
import { getDashboardPathForUser } from "@/lib/dashboardNavigation";
import { useToast } from "@/hooks/use-toast";

export default function RegistrationSuccess() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const userType = searchParams.get("type") as "patient" | "practitioner" | null;
  const practitionerType = searchParams.get("practitionerType");
  const isPendingFinalization = searchParams.get("pending") === "true";
  const userEmail = searchParams.get("email");

  const [countdown, setCountdown] = useState<number | null>(null);
  const [dashboardPath, setDashboardPath] = useState<string>("/dashboard/patient");
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(true);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(userEmail);

  // Vérifier si l'email est confirmé
  useEffect(() => {
    const checkEmailConfirmation = async () => {
      setIsCheckingEmail(true);

      try {
        // Compte connecté ? (session locale) puis état de vérification depuis l'API
        const me = auth.getSession() ? await auth.me({ force: true }) : null;
        const user = me?.user ?? null;

        if (!user) {
          // Pas d'utilisateur connecté - l'email n'est probablement pas confirmé
          setEmailConfirmed(false);
          setIsCheckingEmail(false);
          return;
        }

        setCurrentUserEmail(user.email || null);

        const isConfirmed = user.emailVerified;
        setEmailConfirmed(isConfirmed);

        // Si confirmé, démarrer le countdown pour redirection
        if (isConfirmed) {
          setCountdown(isPendingFinalization ? 15 : 10);
        }
      } catch (error) {
        console.error("Erreur vérification email:", error);
        setEmailConfirmed(false);
      } finally {
        setIsCheckingEmail(false);
      }
    };

    checkEmailConfirmation();

    // Vérifier périodiquement si l'email a été confirmé
    const interval = setInterval(checkEmailConfirmation, 5000);

    return () => clearInterval(interval);
  }, [isPendingFinalization]);

  // Déterminer le chemin du dashboard
  useEffect(() => {
    const determineDashboardPath = async () => {
      if (!userType) {
        navigate("/", { replace: true });
        return;
      }

      let targetPath = "/dashboard/patient";

      if (userType === "practitioner") {
        if (practitionerType === "coach_sportif") {
          targetPath = "/dashboard/coach";
        } else if (practitionerType) {
          targetPath = "/dashboard/practitioner";
        } else {
          const user = auth.getUser();
          if (user) {
            targetPath = await getDashboardPathForUser(user.id);
          } else {
            targetPath = "/dashboard/practitioner";
          }
        }
      }

      setDashboardPath(targetPath);
    };

    determineDashboardPath();
  }, [userType, practitionerType, navigate]);

  // Countdown et redirection automatique (seulement si email confirmé)
  useEffect(() => {
    if (!userType || countdown === null || !emailConfirmed) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          navigate(dashboardPath, { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [userType, dashboardPath, navigate, countdown, emailConfirmed]);

  // Renvoyer l'email de confirmation
  const handleResendEmail = async () => {
    if (!currentUserEmail) {
      toast({
        title: "Erreur",
        description: "Adresse email non disponible. Veuillez vous reconnecter.",
        variant: "destructive"
      });
      return;
    }

    setIsResendingEmail(true);

    try {
      let error: unknown = null;
      try {
        await auth.resendVerification(currentUserEmail);
      } catch (e) {
        error = e;
      }

      if (error) {
        toast({
          title: "Erreur",
          description: errorMessage(error, "Impossible de renvoyer l'email"),
          variant: "destructive"
        });
      } else {
        toast({
          title: "Email envoyé",
          description: "Vérifiez votre boîte de réception et vos spams.",
        });
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setIsResendingEmail(false);
    }
  };

  // Accéder au dashboard manuellement
  const handleGoToDashboard = () => {
    if (!emailConfirmed) {
      toast({
        title: "Email non confirmé",
        description: "Veuillez d'abord confirmer votre email en cliquant sur le lien reçu.",
        variant: "destructive"
      });
      return;
    }
    navigate(dashboardPath, { replace: true });
  };

  if (!userType) return null;

  const isPractitioner = userType === "practitioner";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />

      <div className="container mx-auto px-3 sm:px-4 py-8 sm:py-12 md:py-16 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="w-full max-w-2xl border-2 shadow-lg animate-fade-in">
          <CardHeader className="text-center space-y-3 sm:space-y-4 pb-6 sm:pb-8 px-4 sm:px-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-3 sm:p-4 animate-scale-in">
                <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-bold">
              Inscription réussie !
            </CardTitle>
            <CardDescription className="text-base sm:text-lg px-2">
              {isPractitioner
                ? "Votre demande d'inscription a été soumise avec succès"
                : "Bienvenue sur DomiCares"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 sm:space-y-6 px-4 sm:px-6">
            {/* Alerte confirmation email - Prioritaire */}
            {!isCheckingEmail && !emailConfirmed && (
              <div className="bg-orange-500/10 border-2 border-orange-500/30 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-orange-500 mt-0.5 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold text-orange-600 dark:text-orange-400">
                      Confirmez votre adresse email
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Un email de confirmation a été envoyé à <strong>{currentUserEmail || "votre adresse"}</strong>.
                      Cliquez sur le lien dans l'email pour activer votre compte.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pensez à vérifier vos spams si vous ne le trouvez pas.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResendEmail}
                      disabled={isResendingEmail}
                      className="mt-2"
                    >
                      {isResendingEmail ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Renvoyer l'email
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Email confirmé - Message de succès */}
            {!isCheckingEmail && emailConfirmed && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-green-600 dark:text-green-400">
                      Email confirmé
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Votre adresse email a été vérifiée avec succès.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isPractitioner ? (
              <>
                {isPendingFinalization && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-blue-500 mt-0.5 shrink-0 animate-pulse" />
                      <div className="space-y-2">
                        <h3 className="font-semibold text-blue-600">Finalisation en cours</h3>
                        <p className="text-sm text-muted-foreground">
                          Votre inscription est en cours de finalisation. Cela peut prendre quelques minutes.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-warning mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-warning">Compte en attente de validation KYC</h3>
                      <p className="text-sm text-muted-foreground">
                        <strong>Votre compte sera activé après vérification de votre dossier (24 à 48 heures).</strong> Notre équipe examine vos documents professionnels et votre identité.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold">Prochaines étapes :</h4>
                  <ol className="space-y-2 ml-4">
                    <li className={`text-sm ${emailConfirmed ? 'text-green-600 line-through' : 'text-muted-foreground font-medium'}`}>
                      1. {emailConfirmed ? '✓' : '→'} Confirmer votre adresse email
                    </li>
                    <li className="text-sm text-muted-foreground">2. Vérification de vos documents professionnels</li>
                    <li className="text-sm text-muted-foreground">3. Validation de votre identité</li>
                    <li className="text-sm text-muted-foreground">4. Activation de votre compte</li>
                  </ol>
                </div>

                {emailConfirmed && (
                  <p className="text-sm text-muted-foreground text-center">
                    En attendant la validation KYC, vous pouvez consulter votre tableau de bord, mais vous ne pourrez accepter de consultations qu'après validation.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-primary">
                        {emailConfirmed ? "Compte activé" : "Compte créé"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {emailConfirmed
                          ? "Votre compte patient est maintenant actif. Vous pouvez commencer à rechercher des praticiens et prendre rendez-vous."
                          : "Confirmez votre email pour activer votre compte et commencer à utiliser DomiCares."
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {emailConfirmed && (
                  <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                    <h4 className="font-semibold">Commencez maintenant :</h4>
                    <ul className="space-y-2 ml-4">
                      <li className="text-sm text-muted-foreground">✓ Complétez votre profil médical</li>
                      <li className="text-sm text-muted-foreground">✓ Recherchez un praticien près de chez vous</li>
                      <li className="text-sm text-muted-foreground">✓ Prenez rendez-vous en quelques clics</li>
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="pt-4 border-t space-y-3">
              <Button
                className="w-full min-h-[48px] text-base"
                size="lg"
                onClick={handleGoToDashboard}
                disabled={!emailConfirmed || isCheckingEmail}
              >
                {isCheckingEmail ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Vérification...
                  </>
                ) : emailConfirmed ? (
                  <>
                    Accéder à mon tableau de bord
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Confirmez d'abord votre email
                  </>
                )}
              </Button>

              {emailConfirmed && countdown !== null && countdown > 0 && (
                <p className="text-xs sm:text-sm text-center text-muted-foreground">
                  Redirection automatique dans {countdown} seconde{countdown > 1 ? "s" : ""}...
                </p>
              )}

              {!emailConfirmed && !isCheckingEmail && (
                <p className="text-xs sm:text-sm text-center text-muted-foreground">
                  La redirection sera activée après confirmation de votre email.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
