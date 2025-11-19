import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, Stethoscope } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import UserTypeCard from "@/components/UserTypeCard";

export default function SignupPage() {
  const navigate = useNavigate();
  const { data: user, isLoading } = useSupabaseUser();

  useEffect(() => {
    if (!isLoading && user) {
      getDashboardPathForUser(user.id).then((path) => {
        navigate(path, { replace: true });
      });
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/20 to-secondary/10">
      <Header />

      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-4xl">
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

          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Créer un compte</h1>
            <p className="text-lg text-muted-foreground">
              Choisissez votre type de compte pour commencer
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <UserTypeCard
              title="Patient"
              description="Accédez aux soins de santé à domicile, prenez rendez-vous et gérez vos consultations"
              icon={User}
              buttonText="S'inscrire comme Patient"
              variant="patient"
              onSelect={() => navigate("/signup/patient")}
              features={[
                "Prise de rendez-vous en ligne",
                "Suivi de vos consultations",
                "Dossier médical sécurisé",
                "Paiement en ligne"
              ]}
            />

            <UserTypeCard
              title="Praticien"
              description="Rejoignez notre réseau de professionnels de santé certifiés et développez votre activité"
              icon={Stethoscope}
              buttonText="S'inscrire comme Praticien"
              variant="practitioner"
              onSelect={() => navigate("/signup/practitioner")}
              features={[
                "Gestion de votre agenda",
                "Suivi des patients",
                "Paiements sécurisés",
                "Visibilité auprès des patients"
              ]}
            />
          </div>
        </div>
      </main>
    </div>
  );
}