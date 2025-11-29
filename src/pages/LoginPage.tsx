import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Heart, Stethoscope } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import { navigateToHome } from "@/lib/auth-navigation";

export default function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 via-background to-secondary/10">
      <Header />

      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => navigateToHome(navigate)}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </div>

          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Connexion
            </h1>
            <p className="text-lg text-muted-foreground">
              Choisissez votre type de compte
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Connexion Patient */}
            <Card className="shadow-elegant hover:shadow-glow transition-all duration-300 border-patient/20 hover:border-patient/40 cursor-pointer group">
              <CardHeader className="text-center pb-6">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-patient to-patient-light rounded-full flex items-center justify-center mb-4 shadow-elegant group-hover:shadow-glow transition-all duration-300">
                  <Heart className="h-10 w-10 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-foreground">
                  Patient
                </CardTitle>
                <CardDescription className="text-base">
                  Accédez à votre espace patient pour consulter vos rendez-vous et votre dossier médical
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link to="/patient-login" className="block">
                  <Button 
                    variant="patient" 
                    size="xl" 
                    className="w-full"
                  >
                    Se connecter en tant que patient
                  </Button>
                </Link>
                <Link to="/login" className="block">
                  <Button 
                    variant="outline" 
                    className="w-full"
                  >
                    Connexion avec OTP
                  </Button>
                </Link>
                <div className="pt-4 border-t text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Pas encore de compte ?
                  </p>
                  <Link to="/signup/patient" className="text-sm text-patient hover:underline font-medium">
                    Créer un compte patient
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Connexion Praticien */}
            <Card className="shadow-elegant hover:shadow-glow transition-all duration-300 border-primary/20 hover:border-primary/40 cursor-pointer group">
              <CardHeader className="text-center pb-6">
                <div className="w-20 h-20 mx-auto gradient-primary rounded-full flex items-center justify-center mb-4 shadow-elegant group-hover:shadow-glow transition-all duration-300">
                  <Stethoscope className="h-10 w-10 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-foreground">
                  Praticien
                </CardTitle>
                <CardDescription className="text-base">
                  Accédez à votre espace professionnel pour gérer vos consultations et patients
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link to="/practitioner-login" className="block">
                  <Button 
                    variant="practitioner" 
                    size="xl" 
                    className="w-full"
                  >
                    Se connecter en tant que praticien
                  </Button>
                </Link>
                <Link to="/login" className="block">
                  <Button 
                    variant="outline" 
                    className="w-full"
                  >
                    Connexion avec OTP
                  </Button>
                </Link>
                <div className="pt-4 border-t text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Pas encore de compte ?
                  </p>
                  <Link to="/signup/practitioner" className="text-sm text-primary hover:underline font-medium">
                    Créer un compte praticien
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}