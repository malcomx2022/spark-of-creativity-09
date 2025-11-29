import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { PhoneInput } from '@/components/ui/phone-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useOTPAuth } from '@/hooks/useOTPAuth';
import { supabase } from '@/integrations/supabase/client';
import { getDashboardPathForUser, getDashboardPathFromAuth } from '@/lib/dashboardNavigation';
import { MessageSquare, Phone, Loader2, ArrowLeft } from 'lucide-react';
import { withTimeout, NetworkTimeoutError } from '@/lib/network-timeout';
import { useToast } from "@/hooks/use-toast";

type OTPChannel = 'sms' | 'whatsapp' | 'call';

export default function LoginWithOTP() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sendOTP, verifyOTP, sendingOTP, verifyingOTP, phoneStored } = useOTPAuth();
  
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneNumber, setPhoneNumber] = useState(phoneStored || '');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<OTPChannel>('sms');
  const [countdown, setCountdown] = useState(0);

  const redirectToDashboard = useCallback(async () => {
    const destination = await getDashboardPathFromAuth();
    navigate(destination, { replace: true });
  }, [navigate]);

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession());
        if (session) {
          await redirectToDashboard();
        }
      } catch (error) {
        // Silencieux - l'utilisateur n'est simplement pas connecté
        console.error('Session check timeout:', error);
      }
    };
    void checkSession();
  }, [redirectToDashboard]);

  // Countdown pour le renvoi du code
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handlePhoneChange = (value: string) => {
    setPhoneNumber(value);
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phoneNumber || phoneNumber.length < 12) {
      toast({
        title: "Numéro invalide",
        description: "Veuillez entrer un numéro de téléphone valide (format: +229XXXXXXXX)",
        variant: "destructive"
      });
      return;
    }

    try {
      await sendOTP(phoneNumber, channel);
      setStep('code');
      setCountdown(60); // 60 seconds countdown
    } catch (error) {
      console.error('Error sending OTP:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le code. Veuillez réessayer.",
        variant: "destructive"
      });
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (code.length !== 6) {
      return;
    }

    try {
      await verifyOTP(phoneNumber, code);
      // La session est définie automatiquement par verifyOTP
      // Rediriger vers le dashboard approprié
      await redirectToDashboard();
    } catch (error) {
      console.error('Error verifying OTP:', error);
    }
  };

  const handleResendOTP = async () => {
    if (countdown > 0) return;
    
    try {
      await sendOTP(phoneNumber, channel);
      setCountdown(60);
    } catch (error) {
      console.error('Error resending OTP:', error);
    }
  };

  const handleBackToPhone = () => {
    setStep('phone');
    setCode('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10">
      <Header />
      <main className="pt-24 pb-12">
        <div className="container max-w-md mx-auto px-4">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-medical">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Connexion par SMS</CardTitle>
              <CardDescription>
                {step === 'phone' 
                  ? "Entrez votre numéro de téléphone pour recevoir un code de vérification"
                  : "Entrez le code à 6 chiffres envoyé par SMS"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step === 'phone' ? (
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Numéro de téléphone</Label>
                    <PhoneInput
                      id="phone"
                      value={phoneNumber}
                      onChange={handlePhoneChange}
                      countryCode="+229"
                      localNumberLength={8}
                      disabled={sendingOTP}
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="patient"
                    size="xl"
                    className="w-full"
                    disabled={sendingOTP || !phoneNumber || phoneNumber.length !== 12}
                  >
                    {sendingOTP ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      'Envoyer le code'
                    )}
                  </Button>

                  <div className="text-center">
                    <Link
                      to="/login-email"
                      className="text-sm text-primary hover:underline"
                    >
                      Se connecter avec email/mot de passe
                    </Link>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Code de vérification</Label>
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={code}
                        onChange={(value) => setCode(value)}
                        disabled={verifyingOTP}
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
                    <p className="text-xs text-muted-foreground text-center">
                      Code envoyé au {phoneNumber}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    variant="patient"
                    size="xl"
                    className="w-full"
                    disabled={verifyingOTP || code.length !== 6}
                  >
                    {verifyingOTP ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Vérification...
                      </>
                    ) : (
                      'Vérifier le code'
                    )}
                  </Button>

                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={handleResendOTP}
                      disabled={countdown > 0 || sendingOTP}
                    >
                      {countdown > 0 ? (
                        `Renvoyer le code dans ${countdown}s`
                      ) : sendingOTP ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Envoi...
                        </>
                      ) : (
                        'Renvoyer le code'
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleBackToPhone}
                      disabled={verifyingOTP || sendingOTP}
                    >
                      Modifier le numéro
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
