import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Shield, X } from 'lucide-react';

export type TermsType = 'cgu' | 'charte' | 'privacy';

interface TermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: TermsType;
  onAccept?: () => void;
}

// Contenu des CGU
const CGUContent = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1. Objet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de la plateforme DomiCares, 
          une plateforme de mise en relation entre patients et professionnels de santé pour des soins à domicile.
        </p>
        <p>
          En utilisant nos services, vous acceptez sans réserve les présentes CGU.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. Inscription et Compte Utilisateur</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          L'utilisation de certains services de DomiCares nécessite la création d'un compte utilisateur. 
          Lors de votre inscription, vous vous engagez à :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Fournir des informations exactes, complètes et à jour</li>
          <li>Maintenir la confidentialité de vos identifiants de connexion</li>
          <li>Informer immédiatement DomiCares de toute utilisation non autorisée de votre compte</li>
          <li>Ne créer qu'un seul compte par utilisateur</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">3. Services Proposés</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          DomiCares propose une plateforme de mise en relation permettant de :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Rechercher des professionnels de santé qualifiés</li>
          <li>Réserver des consultations et soins à domicile</li>
          <li>Gérer les rendez-vous et le suivi médical</li>
          <li>Effectuer des paiements sécurisés</li>
        </ul>
        <p className="mt-3">
          DomiCares agit en tant qu'intermédiaire et ne fournit pas directement les services médicaux. 
          Les praticiens sont des professionnels indépendants.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">4. Obligations des Utilisateurs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Les utilisateurs s'engagent à :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Utiliser la plateforme conformément aux lois en vigueur</li>
          <li>Ne pas porter atteinte aux droits de DomiCares ou des autres utilisateurs</li>
          <li>Respecter les rendez-vous confirmés ou les annuler dans les délais prévus</li>
          <li>Fournir des informations médicales exactes et complètes</li>
          <li>Traiter les professionnels de santé avec respect</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">5. Tarifs et Paiement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
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

    <Card>
      <CardHeader>
        <CardTitle className="text-base">6. Responsabilité</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          DomiCares s'efforce de maintenir un service de qualité mais ne peut garantir :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>La disponibilité continue et sans interruption de la plateforme</li>
          <li>L'absence d'erreurs ou de bugs</li>
          <li>La qualité des services fournis par les praticiens indépendants</li>
        </ul>
        <p className="mt-3">
          Les praticiens sont seuls responsables de la qualité et de la légalité des soins qu'ils prodiguent.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">7. Modification des CGU</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          DomiCares se réserve le droit de modifier les présentes CGU à tout moment. 
          Les utilisateurs seront informés des modifications par email ou via la plateforme.
        </p>
        <p>
          La poursuite de l'utilisation de la plateforme après modification vaut acceptation des nouvelles CGU.
        </p>
      </CardContent>
    </Card>
  </div>
);

// Contenu de la Charte d'engagement des praticiens
const CharteContent = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1. Engagement de Qualité</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          En tant que praticien DomiCares, je m'engage à :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Fournir des soins de qualité conformes aux standards professionnels</li>
          <li>Maintenir mes compétences à jour par la formation continue</li>
          <li>Utiliser des équipements et produits conformes aux normes</li>
          <li>Respecter les protocoles sanitaires et d'hygiène</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. Qualifications et Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Je certifie sur l'honneur :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Posséder les diplômes et certifications requis pour exercer ma profession</li>
          <li>Disposer d'une assurance professionnelle à jour</li>
          <li>Ne pas faire l'objet d'interdiction d'exercer</li>
          <li>Fournir des documents authentiques et non falsifiés</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">3. Confidentialité et Secret Professionnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Je m'engage à :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Respecter le secret médical et la confidentialité des données patients</li>
          <li>Ne pas divulguer les informations personnelles des patients</li>
          <li>Protéger les données de santé conformément à la réglementation</li>
          <li>Signaler toute violation de données à DomiCares</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">4. Respect des Engagements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Je m'engage à :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Honorer les rendez-vous confirmés ou les annuler dans les délais prévus</li>
          <li>Être ponctuel aux rendez-vous programmés</li>
          <li>Informer le patient et DomiCares en cas d'empêchement</li>
          <li>Traiter tous les patients avec respect et dignité</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">5. Tarification Transparente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Je m'engage à :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Afficher des tarifs clairs et complets sur la plateforme</li>
          <li>Ne pas facturer de frais supplémentaires non convenus</li>
          <li>Respecter les tarifs annoncés lors de la réservation</li>
          <li>Fournir des factures détaillées sur demande</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">6. Sanctions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Je reconnais que le non-respect de cette charte peut entraîner :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Un avertissement formel</li>
          <li>Une suspension temporaire de mon compte</li>
          <li>Une exclusion définitive de la plateforme</li>
          <li>Des poursuites légales en cas de faute grave</li>
        </ul>
      </CardContent>
    </Card>
  </div>
);

// Contenu de la Politique de Confidentialité
const PrivacyContent = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">1. Introduction</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          DomiCares s'engage à protéger la confidentialité et la sécurité des données personnelles de ses utilisateurs. 
          Cette politique de confidentialité explique comment nous collectons, utilisons, partageons et protégeons vos informations.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">2. Données Collectées</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p><strong>Données d'identification :</strong></p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Nom et prénom</li>
          <li>Adresse email et numéro de téléphone</li>
          <li>Adresse postale et date de naissance</li>
        </ul>
        <p className="mt-3"><strong>Données médicales (patients) :</strong></p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Antécédents médicaux et symptômes</li>
          <li>Traitements en cours et allergies</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">3. Utilisation des Données</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Vos données sont utilisées pour :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Créer et gérer votre compte utilisateur</li>
          <li>Faciliter la mise en relation entre patients et praticiens</li>
          <li>Traiter les réservations et les paiements</li>
          <li>Améliorer nos services et l'expérience utilisateur</li>
          <li>Assurer la sécurité de la plateforme</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">4. Sécurité des Données</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Nous mettons en œuvre des mesures de sécurité :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Chiffrement des données sensibles (SSL/TLS)</li>
          <li>Accès restreint aux données personnelles</li>
          <li>Authentification forte des utilisateurs</li>
          <li>Sauvegardes régulières</li>
        </ul>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">5. Vos Droits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Vous disposez des droits suivants :</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Droit d'accès</strong> : obtenir une copie de vos données</li>
          <li><strong>Droit de rectification</strong> : corriger des données inexactes</li>
          <li><strong>Droit à l'effacement</strong> : demander la suppression de vos données</li>
          <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré</li>
        </ul>
      </CardContent>
    </Card>
  </div>
);

const TERMS_CONFIG = {
  cgu: {
    title: 'Conditions Générales d\'Utilisation',
    icon: FileText,
    content: CGUContent,
  },
  charte: {
    title: 'Charte d\'engagement des praticiens DomiCares',
    icon: Shield,
    content: CharteContent,
  },
  privacy: {
    title: 'Politique de Confidentialité',
    icon: Shield,
    content: PrivacyContent,
  },
};

export function TermsDialog({ open, onOpenChange, type, onAccept }: TermsDialogProps) {
  const config = TERMS_CONFIG[type];
  const Icon = config.icon;
  const Content = config.content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg">{config.title}</DialogTitle>
              <DialogDescription className="text-sm">
                Veuillez lire attentivement avant d'accepter
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <ScrollArea className="max-h-[55vh] px-6">
          <Content />
        </ScrollArea>

        <div className="p-6 pt-4 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          {onAccept && (
            <Button onClick={() => {
              onAccept();
              onOpenChange(false);
            }}>
              J'ai lu et j'accepte
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
