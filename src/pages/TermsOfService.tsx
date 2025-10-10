import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      
      <main className="container mx-auto px-4 pt-24 pb-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-center">Conditions Générales d'Utilisation</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Objet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de la plateforme DomiCares, 
              une plateforme de mise en relation entre patients et professionnels de santé pour des soins à domicile.
            </p>
            <p>
              En utilisant nos services, vous acceptez sans réserve les présentes CGU.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. Inscription et Compte Utilisateur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              L'utilisation de certains services de DomiCares nécessite la création d'un compte utilisateur. 
              Lors de votre inscription, vous vous engagez à :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Fournir des informations exactes, complètes et à jour</li>
              <li>Maintenir la confidentialité de vos identifiants de connexion</li>
              <li>Informer immédiatement DomiCares de toute utilisation non autorisée de votre compte</li>
              <li>Ne créer qu'un seul compte par utilisateur</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. Services Proposés</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              DomiCares propose une plateforme de mise en relation permettant de :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Rechercher des professionnels de santé qualifiés</li>
              <li>Réserver des consultations et soins à domicile</li>
              <li>Gérer les rendez-vous et le suivi médical</li>
              <li>Effectuer des paiements sécurisés</li>
            </ul>
            <p className="mt-4">
              DomiCares agit en tant qu'intermédiaire et ne fournit pas directement les services médicaux. 
              Les praticiens sont des professionnels indépendants.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>4. Obligations des Utilisateurs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Les utilisateurs s'engagent à :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Utiliser la plateforme conformément aux lois en vigueur</li>
              <li>Ne pas porter atteinte aux droits de DomiCares ou des autres utilisateurs</li>
              <li>Respecter les rendez-vous confirmés ou les annuler dans les délais prévus</li>
              <li>Fournir des informations médicales exactes et complètes</li>
              <li>Traiter les professionnels de santé avec respect</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>5. Obligations des Praticiens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Les professionnels de santé s'engagent à :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Posséder les diplômes et certifications requis pour exercer</li>
              <li>Maintenir une assurance professionnelle à jour</li>
              <li>Respecter le secret médical et la confidentialité des données patients</li>
              <li>Fournir des soins conformes aux standards professionnels</li>
              <li>Honorer les rendez-vous confirmés</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>6. Tarifs et Paiement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Les tarifs des services sont affichés sur la plateforme et peuvent varier selon les praticiens. 
              Le paiement s'effectue de manière sécurisée via la plateforme.
            </p>
            <p>
              DomiCares perçoit une commission sur chaque transaction. Les modalités de remboursement en cas d'annulation 
              sont définies dans notre politique d'annulation.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>7. Responsabilité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              DomiCares s'efforce de maintenir un service de qualité mais ne peut garantir :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>La disponibilité continue et sans interruption de la plateforme</li>
              <li>L'absence d'erreurs ou de bugs</li>
              <li>La qualité des services fournis par les praticiens indépendants</li>
            </ul>
            <p className="mt-4">
              Les praticiens sont seuls responsables de la qualité et de la légalité des soins qu'ils prodiguent.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>8. Propriété Intellectuelle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Tous les contenus présents sur la plateforme (textes, images, logos, design) sont protégés par les droits 
              de propriété intellectuelle et appartiennent à DomiCares ou à ses partenaires.
            </p>
            <p>
              Toute reproduction, même partielle, est interdite sans autorisation préalable.
            </p>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>9. Modification des CGU</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              DomiCares se réserve le droit de modifier les présentes CGU à tout moment. 
              Les utilisateurs seront informés des modifications par email ou via la plateforme.
            </p>
            <p>
              La poursuite de l'utilisation de la plateforme après modification vaut acceptation des nouvelles CGU.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10. Droit Applicable et Juridiction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Les présentes CGU sont régies par le droit en vigueur dans le pays d'exploitation de DomiCares.
            </p>
            <p>
              En cas de litige, les parties s'efforceront de trouver une solution amiable. 
              À défaut, les tribunaux compétents seront seuls habilités à statuer.
            </p>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center mt-8">
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}
        </p>
      </main>
    </div>
  );
}
