import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, AlertCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_MESSAGES } from "@/lib/auth-constants";
import { navigateToLogin } from "@/lib/auth-navigation";

export default function ConfirmEmail() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [isResending, setIsResending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  const email = searchParams.get('email');
  const userType = searchParams.get('type') || 'patient';

  const handleResendEmail = async () => {
    if (!email) {
      toast({
        title: "Erreur",
        description: "Adresse email manquante. Veuillez vous réinscrire.",
        variant: "destructive"
      });
      return;
    }

    setIsResending(true);
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard/${userType}`
        }
      });

      if (error) {
        toast({
          ...AUTH_MESSAGES.EMAIL_CONFIRMATION_ERROR,
          description: error.message || AUTH_MESSAGES.EMAIL_CONFIRMATION_ERROR.defaultDescription,
          variant: "destructive"
        });
      } else {
        toast({
          ...AUTH_MESSAGES.OTP_RESENT,
          description: "Vérifiez votre boîte de réception.",
        });
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-16 flex justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Confirmez votre email</CardTitle>
            <CardDescription>
              Un email de confirmation a été envoyé à votre adresse
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {email && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium text-center">{email}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Vérifiez votre boîte de réception
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Cliquez sur le lien dans l'email pour activer votre compte. 
                    Pensez à vérifier vos spams si vous ne le trouvez pas.
                  </p>
                </div>
              </div>

              {emailSent && (
                <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      Email renvoyé avec succès
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Vérifiez votre boîte de réception et vos spams.
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4 space-y-3">
                <Button
                  onClick={handleResendEmail}
                  disabled={isResending || emailSent}
                  variant="outline"
                  className="w-full"
                >
                  {isResending ? "Envoi en cours..." : emailSent ? "Email renvoyé" : "Renvoyer l'email de confirmation"}
                </Button>

                <Button
                  onClick={() => navigateToLogin(navigate)}
                  variant="ghost"
                  className="w-full"
                >
                  Retour à la connexion
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground text-center">
                Vous avez déjà confirmé votre email ?{" "}
                <button
                  onClick={() => navigateToLogin(navigate)}
                  className="text-primary hover:underline font-medium"
                >
                  Connectez-vous ici
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
