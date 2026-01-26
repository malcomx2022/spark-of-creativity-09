import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail, Clock, ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardPathForUser } from "@/lib/dashboardNavigation";

export default function RegistrationSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userType = searchParams.get("type") as "patient" | "practitioner" | null;
  const practitionerType = searchParams.get("practitionerType");
  const isPendingFinalization = searchParams.get("pending") === "true";
  const [countdown, setCountdown] = useState(isPendingFinalization ? 15 : 10);
  const [dashboardPath, setDashboardPath] = useState<string>("/dashboard/patient");

  useEffect(() => {
    const determineDashboardPath = async () => {
      if (!userType) {
        navigate("/", { replace: true });
        return;
      }

      let targetPath = "/dashboard/patient";
      
      if (userType === "practitioner") {
        // Si on a le practitionerType dans l'URL, on l'utilise directement
        if (practitionerType === "coach_sportif") {
          targetPath = "/dashboard/coach";
        } else if (practitionerType) {
          targetPath = "/dashboard/practitioner";
        } else {
          // Sinon, on récupère l'info depuis la base de données
          const { data: { user } } = await supabase.auth.getUser();
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

  useEffect(() => {
    if (!userType) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate(dashboardPath, { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [userType, dashboardPath, navigate]);

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
            {isPractitioner ? (
              <>
                {isPendingFinalization && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-3 mb-4">
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-blue-500 mt-0.5 shrink-0 animate-pulse" />
                      <div className="space-y-2">
                        <h3 className="font-semibold text-blue-600">Finalisation en cours</h3>
                        <p className="text-sm text-muted-foreground">
                          Votre inscription est en cours de finalisation. Cela peut prendre quelques minutes. Vous recevrez un email de confirmation une fois terminé.
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

                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    Vous serez notifié par :
                  </h4>
                  <ul className="space-y-2 ml-7">
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Email de confirmation
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      SMS de notification
                    </li>
                  </ul>
                </div>

                <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold">Prochaines étapes :</h4>
                  <ol className="space-y-2 ml-4">
                    <li className="text-sm text-muted-foreground">1. Vérification de vos documents professionnels</li>
                    <li className="text-sm text-muted-foreground">2. Validation de votre identité</li>
                    <li className="text-sm text-muted-foreground">3. Activation de votre compte</li>
                  </ol>
                </div>

                <p className="text-sm text-muted-foreground text-center">
                  En attendant, vous pouvez consulter votre tableau de bord, mais vous ne pourrez accepter de consultations qu'après validation.
                </p>
              </>
            ) : (
              <>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-primary">Compte activé</h3>
                      <p className="text-sm text-muted-foreground">
                        Votre compte patient est maintenant actif. Vous pouvez commencer à rechercher des praticiens et prendre rendez-vous.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold">Commencez maintenant :</h4>
                  <ul className="space-y-2 ml-4">
                    <li className="text-sm text-muted-foreground">✓ Complétez votre profil médical</li>
                    <li className="text-sm text-muted-foreground">✓ Recherchez un praticien près de chez vous</li>
                    <li className="text-sm text-muted-foreground">✓ Prenez rendez-vous en quelques clics</li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                  <Mail className="w-4 h-4" />
                  <span>Un email de confirmation vous a été envoyé</span>
                </div>
              </>
            )}

            <div className="pt-4 border-t space-y-3">
              <Button 
                className="w-full min-h-[48px] text-base"
                size="lg"
                onClick={() => navigate(dashboardPath, { replace: true })}
              >
                Accéder à mon tableau de bord
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              
              <p className="text-xs sm:text-sm text-center text-muted-foreground">
                Redirection automatique dans {countdown} seconde{countdown > 1 ? "s" : ""}...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
