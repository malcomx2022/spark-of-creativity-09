import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ArrowLeft, Shield } from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { auth } from "@/lib/api";
import { getDashboardPathFromAuth } from "@/lib/dashboardNavigation";
import { AUTH_MESSAGES } from "@/lib/auth-constants";
import { navigateToLogin } from "@/lib/auth-navigation";
import { postLoginPath } from '@/lib/return-path';

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otp, setOtp] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const phone = location.state?.phone;
  const email = location.state?.email;
  const type = location.state?.type;

  if (!phone && !email) {
    navigateToLogin(navigate, true);
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Limiter les tentatives
    if (attempts >= 5) {
      toast({
        title: "Trop de tentatives",
        description: "Veuillez demander un nouveau code",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    setAttempts(prev => prev + 1);

    try {
      if (type !== "sms" || !phone) {
        throw new Error("La vérification par e-mail n'est plus disponible : utilisez le lien reçu par e-mail.");
      }
      await auth.verifyOtp(phone, otp);

      toast(AUTH_MESSAGES.LOGIN_SUCCESS);

      const destination = await getDashboardPathFromAuth();
      navigate(postLoginPath(destination), { replace: true });
    } catch (error: unknown) {
      toast({
        ...AUTH_MESSAGES.OTP_ERROR,
        description: (error instanceof Error ? error.message : "") || AUTH_MESSAGES.OTP_ERROR.defaultDescription,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) {
      toast({
        title: "Veuillez patienter",
        description: `Vous pourrez renvoyer le code dans ${resendCooldown} secondes`,
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (type === "sms" && phone) {
        await auth.sendOtp(phone, 'sms');
      } else if (email) {
        await auth.resendVerification(email);
      }

      setAttempts(0); // Réinitialiser les tentatives
      setResendCooldown(60); // Démarrer un cooldown de 60 secondes
      
      // Countdown
      const interval = setInterval(() => {
        setResendCooldown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      toast({
        ...AUTH_MESSAGES.OTP_RESENT,
        description: `Vérifiez vos ${type === "sms" ? "SMS" : "emails"}.`,
      });
    } catch (error: unknown) {
      toast({
        ...AUTH_MESSAGES.OTP_ERROR,
        description: (error instanceof Error ? error.message : "") || AUTH_MESSAGES.OTP_ERROR.defaultDescription,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10">
      <Header />

      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-md">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => navigateToLogin(navigate)}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-medical">
            <CardHeader className="text-center">
              <div className="w-16 h-16 mx-auto gradient-primary rounded-full flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Vérification</CardTitle>
              <CardDescription>
                Entrez le code à 6 chiffres envoyé {type === "sms" ? `au ${phone}` : `à ${email}`}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  type="submit"
                  variant="patient"
                  size="xl"
                  className="w-full"
                  disabled={isSubmitting || otp.length !== 6}
                >
                  {isSubmitting ? "Vérification..." : "Vérifier"}
                </Button>

                <div className="text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleResendCode}
                    className="text-sm"
                    disabled={resendCooldown > 0}
                  >
                    {resendCooldown > 0 
                      ? `Renvoyer le code dans ${resendCooldown}s`
                      : "Renvoyer le code"
                    }
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
