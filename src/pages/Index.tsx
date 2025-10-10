import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, User, Stethoscope, Clock, Shield, CheckCircle, Star, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import UserTypeCard from "@/components/UserTypeCard";
import heroImage from "@/assets/hero-medical.jpg";

const Index = () => {
  const navigate = useNavigate();

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
      <section className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl lg:text-6xl font-bold text-foreground leading-tight">
                  Des soins de santé{" "}
                  <span className="gradient-primary bg-clip-text text-transparent">
                    à domicile
                  </span>
                </h1>
                <p className="text-xl text-muted-foreground leading-relaxed">
                  Consultez un professionnel de santé certifié directement chez vous. 
                  Médecins, infirmiers, kinésithérapeutes disponibles 24/7 en Afrique.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  variant="medical"
                  size="xl"
                  onClick={() => navigate("/signup/patient")}
                  className="flex-1"
                >
                  <User className="h-5 w-5 mr-2" />
                  Je suis patient
                </Button>
                <Button
                  variant="practitioner"
                  size="xl"
                  onClick={() => navigate("/signup/practitioner")}
                  className="flex-1"
                >
                  <Stethoscope className="h-5 w-5 mr-2" />
                  Je suis praticien
                </Button>
              </div>

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

            <div className="relative">
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
      <section id="services" className="py-16 bg-white/50">
        <div className="container mx-auto px-4">
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

      {/* How it Works */}
      <section id="how-it-works" className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
              Comment ça marche ?
            </h2>
            <p className="text-xl text-muted-foreground">
              Un processus simple et sécurisé en 4 étapes
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
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
      <section className="py-16 gradient-hero">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto space-y-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-white">
              Prêt à commencer ?
            </h2>
            <p className="text-xl text-white/90">
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
              >
                En savoir plus
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-foreground text-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <img src={heroImage} alt="DomiCares" className="w-8 h-8 rounded-lg" />
                <span className="text-xl font-bold">DomiCares</span>
              </div>
              <p className="text-white/70">
                Votre plateforme de confiance pour les soins de santé à domicile en Afrique.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Services</h4>
              <ul className="space-y-2 text-white/70">
                <li><button onClick={() => navigate('/services')} className="hover:text-white transition-colors">Médecins à domicile</button></li>
                <li><button onClick={() => navigate('/services')} className="hover:text-white transition-colors">Soins infirmiers</button></li>
                <li><button onClick={() => navigate('/services')} className="hover:text-white transition-colors">Kinésithérapie</button></li>
                <li><button onClick={() => navigate('/services')} className="hover:text-white transition-colors">Consultations d'urgence</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-white/70">
                <li><button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">Conditions d'utilisation</button></li>
                <li><button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors">Politique de confidentialité</button></li>
                <li><button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">Charte praticiens</button></li>
                <li><button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">Mentions légales</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-2 text-white/70">
                <li><button onClick={() => navigate('/contact')} className="hover:text-white transition-colors">Nous contacter</button></li>
                <li>Urgences: 112</li>
                <li>Email: contact@domicares.com</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/20 mt-8 pt-8 text-center text-white/70">
            <p>&copy; 2024 DomiCares. Tous droits réservés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
