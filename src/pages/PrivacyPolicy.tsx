import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-center">Politique de Confidentialité</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Introduction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              DomiCares s'engage à protéger la confidentialité et la sécurité des données personnelles de ses utilisateurs. 
              Cette politique de confidentialité explique comment nous collectons, utilisons, partageons et protégeons vos informations.
            </p>
            <p>
              En utilisant nos services, vous acceptez les pratiques décrites dans cette politique.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. Données Collectées</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Nous collectons différents types de données :
            </p>
            <h4 className="font-semibold text-foreground mt-4">Données d'identification</h4>
            <ul className="list-disc pl-6 space-y-2">
              <li>Nom et prénom</li>
              <li>Adresse email</li>
              <li>Numéro de téléphone</li>
              <li>Adresse postale</li>
              <li>Date de naissance</li>
            </ul>
            
            <h4 className="font-semibold text-foreground mt-4">Données médicales (pour les patients)</h4>
            <ul className="list-disc pl-6 space-y-2">
              <li>Antécédents médicaux</li>
              <li>Symptômes et diagnostics</li>
              <li>Traitements en cours</li>
              <li>Allergies et contre-indications</li>
            </ul>

            <h4 className="font-semibold text-foreground mt-4">Données professionnelles (pour les praticiens)</h4>
            <ul className="list-disc pl-6 space-y-2">
              <li>Diplômes et certifications</li>
              <li>Numéro d'inscription à l'ordre professionnel</li>
              <li>Spécialités et compétences</li>
              <li>Assurance professionnelle</li>
            </ul>

            <h4 className="font-semibold text-foreground mt-4">Données de navigation</h4>
            <ul className="list-disc pl-6 space-y-2">
              <li>Adresse IP</li>
              <li>Type de navigateur</li>
              <li>Pages visitées</li>
              <li>Durée de visite</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. Utilisation des Données</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Vos données sont utilisées pour :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Créer et gérer votre compte utilisateur</li>
              <li>Faciliter la mise en relation entre patients et praticiens</li>
              <li>Traiter les réservations et les paiements</li>
              <li>Améliorer nos services et l'expérience utilisateur</li>
              <li>Envoyer des notifications relatives à vos rendez-vous</li>
              <li>Assurer la sécurité de la plateforme</li>
              <li>Respecter nos obligations légales</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>4. Partage des Données</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Vos données peuvent être partagées avec :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Les praticiens</strong> : uniquement les informations nécessaires à la fourniture des soins</li>
              <li><strong>Les prestataires de services</strong> : hébergement, paiement, envoi d'emails (sous contrat de confidentialité)</li>
              <li><strong>Les autorités</strong> : si requis par la loi ou pour protéger nos droits</li>
            </ul>
            <p className="mt-4">
              Nous ne vendons jamais vos données personnelles à des tiers à des fins marketing.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>5. Sécurité des Données</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Nous mettons en œuvre des mesures de sécurité techniques et organisationnelles pour protéger vos données :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Chiffrement des données sensibles (SSL/TLS)</li>
              <li>Accès restreint aux données personnelles</li>
              <li>Authentification forte des utilisateurs</li>
              <li>Sauvegardes régulières</li>
              <li>Surveillance de sécurité 24h/24</li>
              <li>Formation du personnel sur la protection des données</li>
            </ul>
            <p className="mt-4">
              Les données médicales bénéficient d'un niveau de protection renforcé conformément aux réglementations en vigueur.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>6. Conservation des Données</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Nous conservons vos données personnelles :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Données de compte</strong> : pendant la durée de votre compte actif et 3 ans après sa fermeture</li>
              <li><strong>Données médicales</strong> : conformément aux obligations légales (généralement 10 ans)</li>
              <li><strong>Données de paiement</strong> : selon les obligations comptables (généralement 10 ans)</li>
              <li><strong>Données de navigation</strong> : 13 mois maximum</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>7. Vos Droits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Vous disposez des droits suivants concernant vos données personnelles :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Droit d'accès</strong> : obtenir une copie de vos données</li>
              <li><strong>Droit de rectification</strong> : corriger des données inexactes</li>
              <li><strong>Droit à l'effacement</strong> : demander la suppression de vos données</li>
              <li><strong>Droit à la limitation</strong> : limiter le traitement de vos données</li>
              <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré</li>
              <li><strong>Droit d'opposition</strong> : vous opposer au traitement de vos données</li>
            </ul>
            <p className="mt-4">
              Pour exercer ces droits, contactez-nous à : <a href="mailto:privacy@domicares.com" className="text-primary hover:underline">privacy@domicares.com</a>
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>8. Cookies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Nous utilisons des cookies pour améliorer votre expérience sur notre plateforme :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Cookies essentiels</strong> : nécessaires au fonctionnement de la plateforme</li>
              <li><strong>Cookies de performance</strong> : pour analyser l'utilisation du site</li>
              <li><strong>Cookies de fonctionnalité</strong> : pour mémoriser vos préférences</li>
            </ul>
            <p className="mt-4">
              Vous pouvez gérer vos préférences de cookies via les paramètres de votre navigateur.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>9. Modifications de la Politique</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Nous pouvons modifier cette politique de confidentialité pour refléter les changements dans nos pratiques 
              ou les exigences légales. Nous vous informerons de tout changement significatif par email ou via la plateforme.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Pour toute question concernant cette politique de confidentialité ou le traitement de vos données :
            </p>
            <ul className="list-none space-y-2">
              <li>Email : <a href="mailto:privacy@domicares.com" className="text-primary hover:underline">privacy@domicares.com</a></li>
              <li>Téléphone : +225 XX XX XX XX XX</li>
              <li>Adresse : DomiCares, [Adresse complète]</li>
            </ul>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center mt-8">
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}
        </p>
      </main>
    </div>
  );
}
