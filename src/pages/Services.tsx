import Header from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stethoscope, Syringe, Activity, Home, Clock, Shield, Users, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Services() {
  const navigate = useNavigate();

  const services = [
    {
      icon: <Stethoscope className="h-8 w-8 text-primary" />,
      title: "Consultations médicales à domicile",
      description: "Bénéficiez de consultations complètes par des médecins qualifiés, directement chez vous. Diagnostics, prescriptions et suivi médical personnalisé.",
      features: [
        "Médecins généralistes certifiés",
        "Consultations pédiatriques",
        "Suivi de maladies chroniques",
        "Prescriptions médicales"
      ]
    },
    {
      icon: <Syringe className="h-8 w-8 text-primary" />,
      title: "Soins infirmiers",
      description: "Des infirmiers diplômés se déplacent pour tous vos besoins en soins infirmiers : injections, pansements, prélèvements et bien plus.",
      features: [
        "Injections et perfusions",
        "Pansements et soins de plaies",
        "Prélèvements sanguins",
        "Soins post-opératoires"
      ]
    },
    {
      icon: <Activity className="h-8 w-8 text-primary" />,
      title: "Kinésithérapie à domicile",
      description: "Rééducation fonctionnelle et séances de kinésithérapie personnalisées dans le confort de votre domicile.",
      features: [
        "Rééducation post-traumatique",
        "Thérapie des troubles moteurs",
        "Massage thérapeutique",
        "Exercices de mobilité"
      ]
    },
    {
      icon: <Clock className="h-8 w-8 text-primary" />,
      title: "Urgences médicales",
      description: "Service d'urgence disponible 24h/24 et 7j/7 pour les situations critiques nécessitant une intervention rapide.",
      features: [
        "Disponibilité 24h/24",
        "Intervention rapide",
        "Triage médical en ligne",
        "Coordination avec les urgences"
      ]
    },
    {
      icon: <Home className="h-8 w-8 text-primary" />,
      title: "Soins à domicile personnalisés",
      description: "Services adaptés aux besoins spécifiques des personnes âgées, convalescentes ou en situation de dépendance.",
      features: [
        "Aide aux personnes âgées",
        "Soins palliatifs",
        "Suivi post-hospitalisation",
        "Assistance quotidienne"
      ]
    },
    {
      icon: <Heart className="h-8 w-8 text-primary" />,
      title: "Consultations spécialisées",
      description: "Accès à des spécialistes pour des consultations ciblées dans diverses disciplines médicales.",
      features: [
        "Cardiologie",
        "Dermatologie",
        "Gynécologie",
        "Gériatrie"
      ]
    }
  ];

  const advantages = [
    {
      icon: <Shield className="h-6 w-6 text-primary" />,
      title: "Professionnels certifiés",
      description: "Tous nos praticiens sont diplômés et vérifiés"
    },
    {
      icon: <Clock className="h-6 w-6 text-primary" />,
      title: "Disponibilité flexible",
      description: "Réservez selon vos disponibilités, même le week-end"
    },
    {
      icon: <Users className="h-6 w-6 text-primary" />,
      title: "Suivi personnalisé",
      description: "Un accompagnement adapté à votre situation"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        {/* Hero Section */}
        <section className="text-center mb-16">
          <h1 className="text-4xl lg:text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Nos Services de Santé à Domicile
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            DomiCares vous offre une gamme complète de services médicaux professionnels, 
            directement chez vous, pour votre confort et votre bien-être.
          </p>
          <Button size="lg" onClick={() => navigate('/signup')}>
            Commencer maintenant
          </Button>
        </section>

        {/* Services Grid */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">
            Notre gamme de services
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="mb-4">{service.icon}</div>
                  <CardTitle className="text-xl mb-2">{service.title}</CardTitle>
                  <CardDescription>{service.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Advantages */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-12">
            Pourquoi choisir DomiCares ?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {advantages.map((advantage, index) => (
              <Card key={index} className="text-center">
                <CardHeader>
                  <div className="flex justify-center mb-4">{advantage.icon}</div>
                  <CardTitle className="text-lg">{advantage.title}</CardTitle>
                  <CardDescription>{advantage.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="gradient-primary rounded-2xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">
            Prêt à recevoir des soins de qualité chez vous ?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Inscrivez-vous maintenant et réservez votre première consultation
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary"
              onClick={() => navigate('/signup/patient')}
            >
              Je suis patient
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              onClick={() => navigate('/signup/practitioner')}
            >
              Je suis praticien
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
