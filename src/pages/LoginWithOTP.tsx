import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Phone } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";

export default function LoginWithOTP() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Format phone number to E.164 format (add +33 for France if not present)
    let formattedPhone = phoneNumber.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+33' + formattedPhone.replace(/^0/, '');
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
    });

    if (error) {
      toast({
        title: "Erreur lors de l'envoi du code",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Code envoyé !",
        description: "Vérifiez vos SMS pour le code de vérification.",
      });
      navigate("/verify-otp", { state: { phone: formattedPhone } });
    }

    setIsSubmitting(false);
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
              <div className="w-16 h-16 mx-auto gradient-primary rounded-full flex items-center justify-center mb-4">
                <Phone className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Connexion par SMS</CardTitle>
              <CardDescription>
                Entrez votre numéro de téléphone pour recevoir un code de vérification
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="phone">Numéro de téléphone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="06 12 34 56 78"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Format: 06 12 34 56 78 ou +33612345678
                  </p>
                </div>

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
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
