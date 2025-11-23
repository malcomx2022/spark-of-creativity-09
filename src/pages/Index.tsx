import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, User, Stethoscope, Clock, Shield, CheckCircle, Star, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UserTypeCard from "@/components/UserTypeCard";
import heroImage from "@/assets/hero-medical.jpg";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { getDashboardPathForUser } from "@/lib/dashboardNavigation";

const Index = () => {
  const navigate = useNavigate();
  const { data: user } = useSupabaseUser();

  const patientFeatures = [
    "Consultation à domicile 24/7",
    "Professionnels certifiés",
    "Suivi médical personnalisé",
    "Paiement sécurisé Mobile Money",
    "Géolocalisation en temps réel"
  ];

  const practitionerFeatures = [
    "Rejoignez un réseau professionnel",
    "Gestion d'agenda intelligente",
    "Paiements automatisés (63%)",
    "Formation continue",
    "Support technique 24/7"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/10 to-secondary/5">
      <Header />

      {/* Hero Section */}
      <section className="pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center">
            <div className="space-y-6 sm:space-y-8">
              <div className="space-y-3 sm:space-y-4">
                <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-foreground leading-tight">
                  Des soins de santé{" "}
                  <span className="gradient-primary bg-clip-text text-transparent">
                    à domicile
                  </span>
                </h1>
                <p className="text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed">
                  Consultez un professionnel de santé certifié directement chez vous. 
                  Médecins, infirmiers, kinésithérapeutes disponibles 24/7 en Afrique.
                </p>
              </div>

              {user ? (
                <div className="flex justify-center">
                  <Button 
                    size="xl" 
                    onClick={async () => {
                      const path = await getDashboardPathForUser(user.id);
                      navigate(path);
                    }}
                  >
                    Mon tableau de bord
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <Button
                      variant="medical"
                      size="xl"
                      onClick={() => navigate("/signup/patient")}
                      className="flex-1 min-h-[52px] text-base sm:text-lg"
                    >
                      <User className="h-5 w-5 mr-2" />
                      Je suis patient
                    </Button>
                    <Button
                      variant="practitioner"
                      size="xl"
                      onClick={() => navigate("/signup/practitioner")}
                      className="flex-1 min-h-[52px] text-base sm:text-lg"
                    >
                      <Stethoscope className="h-5 w-5 mr-2" />
                      Je suis praticien
                    </Button>
                  </div>

                  <div className="text-center pt-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Vous avez déjà un compte ?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <Button
                        variant="outline"
                        onClick={() => navigate("/login")}
                        className="gap-2"
                      >
                        <Phone className="h-4 w-4" />
                        Connexion par téléphone
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => navigate("/login-email")}
                      >
                        Connexion par email
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">500+</div>
                  <div className="text-sm text-muted-foreground">Praticiens certifiés</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-secondary">24/7</div>
                  <div className="text-sm text-muted-foreground">Disponibilité</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">98%</div>
                  <div className="text-sm text-muted-foreground">Satisfaction</div>
                </div>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="relative z-10">
                <img
                  src={heroImage}
                  alt="Soins médicaux à domicile en Afrique"
                  className="rounded-2xl shadow-2xl animate-float"
                />
              </div>
              <div className="absolute -top-4 -right-4 w-full h-full bg-gradient-primary rounded-2xl opacity-20 blur-xl" />
            </div>
          </div>
        </div>
      </section>

      {/* User Type Selection */}
      {!user && (
        <section id="services" className="py-12 md:py-16 bg-white/50 px-4 sm:px-6">
          <div className="container mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                Choisissez votre profil
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Que vous soyez patient en quête de soins ou professionnel de santé, 
                DomiCares vous accompagne.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <UserTypeCard
                title="Patient"
                description="Accédez aux soins de santé à domicile"
                icon={User}
                features={patientFeatures}
                buttonText="Commencer en tant que patient"
                variant="patient"
                onSelect={() => navigate("/signup/patient")}
              />

              <UserTypeCard
                title="Praticien"
                description="Rejoignez notre réseau professionnel"
                icon={Stethoscope}
                features={practitionerFeatures}
                buttonText="Rejoindre comme praticien"
                variant="practitioner"
                onSelect={() => navigate("/signup/practitioner")}
              />
            </div>
          </div>
        </section>
      )}

      {/* How it Works */}
      <section id="how-it-works" className="py-12 sm:py-16">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-3 sm:mb-4">
              Comment ça marche ?
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground px-4">
              Un processus simple et sécurisé en 4 étapes
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {[
              {
                icon: User,
                title: "1. Inscription",
                description: "Créez votre profil et complétez le questionnaire médical"
              },
              {
                icon: CheckCircle,
                title: "2. Évaluation",
                description: "Notre système évalue vos besoins et détecte les urgences"
              },
              {
                icon: Stethoscope,
                title: "3. Réservation",
                description: "Choisissez votre praticien et créneaux disponibles"
              },
              {
                icon: Heart,
                title: "4. Soins",
                description: "Recevez vos soins à domicile avec suivi GPS"
              }
            ].map((step, index) => (
              <Card key={index} className="text-center shadow-medical hover:shadow-glow transition-all duration-300">
                <CardHeader>
                  <div className="w-16 h-16 mx-auto gradient-primary rounded-full flex items-center justify-center mb-4">
                    <step.icon className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{step.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Services rapides */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-secondary/10 to-primary-glow/5">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-3 sm:mb-4">
              Accédez rapidement à nos services
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground px-4">
              Trouvez le professionnel qu'il vous faut
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate("/search-practitioners")}>
              <CardHeader>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 gradient-primary rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Stethoscope className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Praticiens médicaux</CardTitle>
                    <CardDescription>Médecins, infirmiers, kinés</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Consultations à domicile, soins infirmiers, rééducation et plus encore
                </p>
                <Button className="w-full" variant="medical">
                  <Stethoscope className="mr-2 h-4 w-4" />
                  Rechercher un praticien
                </Button>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate("/search-coaches")}>
              <CardHeader>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Heart className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Coachs sportifs</CardTitle>
                    <CardDescription>Séances groupe & individuelles</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Remise en forme, coaching personnalisé, séances de groupe dynamiques
                </p>
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  <Heart className="mr-2 h-4 w-4" />
                  Trouver un coach
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-white/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
              Pourquoi choisir DomiCares ?
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: "Sécurisé & Certifié",
                description: "Tous nos praticiens sont vérifiés et certifiés par les ordres professionnels"
              },
              {
                icon: Clock,
                title: "Disponible 24/7",
                description: "Service d'urgence et consultations programmées disponibles à tout moment"
              },
              {
                icon: Star,
                title: "Qualité garantie",
                description: "Système d'évaluation et de notation pour assurer la meilleure qualité de soins"
              },
              {
                icon: Heart,
                title: "Suivi personnalisé",
                description: "Historique médical et suivi continu de votre état de santé"
              },
              {
                icon: Phone,
                title: "Support 24/7",
                description: "Équipe de support technique et médicale disponible en permanence"
              },
              {
                icon: CheckCircle,
                title: "Paiement sécurisé",
                description: "Paiements Mobile Money et cartes bancaires avec commission transparente"
              }
            ].map((feature, index) => (
              <Card key={index} className="shadow-medical hover:shadow-glow transition-all duration-300">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-primary mb-2" />
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 gradient-hero px-4 sm:px-6">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto space-y-6 md:space-y-8">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              Prêt à commencer ?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-white/90">
              Rejoignez des milliers d'utilisateurs qui font confiance à DomiCares 
              pour leurs soins de santé à domicile.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                variant="secondary"
                size="xl"
                onClick={() => navigate("/signup/patient")}
                className="bg-white text-primary hover:bg-white/90"
              >
                <User className="h-5 w-5 mr-2" />
                Commencer maintenant
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="border-white text-white hover:bg-white hover:text-primary"
                onClick={() => navigate('/services')}
              >
                En savoir plus
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
