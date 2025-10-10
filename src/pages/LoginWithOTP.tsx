import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Phone, Mail } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginWithOTP() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState<"email" | "sms">("email");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (activeTab === "sms") {
        // Format phone number to E.164 format (add +33 for France if not present)
        let formattedPhone = phoneNumber.trim();
        if (!formattedPhone.startsWith('+')) {
          formattedPhone = '+33' + formattedPhone.replace(/^0/, '');
        }

        const { error } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
        });

        if (error) throw error;

        toast({
          title: "Code envoyé !",
          description: "Vérifiez vos SMS pour le code de vérification.",
        });
        navigate("/verify-otp", { state: { phone: formattedPhone, type: "sms" } });
      } else {
        // Email OTP
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        toast({
          title: "Code envoyé !",
          description: "Vérifiez votre email pour le code de vérification.",
        });
        navigate("/verify-otp", { state: { email: email.trim(), type: "email" } });
      }
    } catch (error: any) {
      toast({
        title: "Erreur lors de l'envoi du code",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
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
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <Card className="shadow-medical">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Connexion avec code OTP</CardTitle>
              <CardDescription>
                Choisissez votre méthode de réception du code
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "email" | "sms")} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger value="sms" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    SMS
                  </TabsTrigger>
                </TabsList>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <TabsContent value="email" className="space-y-4 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="email">Adresse email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="votre@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required={activeTab === "email"}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="sms" className="space-y-4 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Numéro de téléphone *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="06 12 34 56 78"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        required={activeTab === "sms"}
                      />
                      <p className="text-sm text-muted-foreground">
                        Format: 06 12 34 56 78 ou +33612345678
                      </p>
                    </div>
                  </TabsContent>

                  <Button
                    type="submit"
                    variant="patient"
                    size="xl"
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Envoi en cours..." : "Recevoir le code"}
                  </Button>
                </form>

                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Problème avec l'envoi du code ?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/login-email")}
                    className="w-full"
                  >
                    Se connecter avec mot de passe
                  </Button>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
