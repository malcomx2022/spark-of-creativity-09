import { useNavigate, Link } from "react-router-dom";
import logo from "@/assets/logo.png";
import { Phone, Mail } from "lucide-react";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useUserType } from "@/contexts/UserTypeContext";
import { ROUTES } from "@/lib/routes";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Footer() {
  const navigate = useNavigate();
  const { data: user } = useSupabaseUser();
  const { isPractitioner, error } = useUserType();

  // Afficher un fallback minimal si erreur de chargement du type utilisateur
  if (error) {
    console.error('Erreur chargement type utilisateur:', error);
  }

  return (
    <footer className="bg-secondary/10 border-t border-border mt-auto" role="contentinfo">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo et Description */}
          <div className="col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <img src={logo} alt="" className="w-10 h-10" aria-hidden="true" />
              <div>
                <span className="text-lg font-bold text-foreground block">DomiCares</span>
                <span className="text-xs text-muted-foreground block">Soins à domicile</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Votre plateforme de confiance pour les soins de santé à domicile.
            </p>
          </div>

          {/* Navigation */}
          <nav aria-label="Liens de navigation du pied de page">
            <h3 className="font-semibold text-foreground mb-3">Navigation</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to={ROUTES.HOME}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Accueil
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.SERVICES}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Services
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.SEARCH_PRACTITIONERS}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Recherche
                </Link>
              </li>
            </ul>
          </nav>

          {/* Espaces */}
          <nav aria-label="Accès aux espaces utilisateur">
            <h3 className="font-semibold text-foreground mb-3">Espaces</h3>
            <TooltipProvider>
              <ul className="space-y-2">
                <li>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => navigate(ROUTES.DASHBOARD_PATIENT)}
                        disabled={isPractitioner === true}
                        aria-disabled={isPractitioner === true}
                        className={`text-sm transition-colors ${
                          isPractitioner === true
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-muted-foreground hover:text-primary"
                        }`}
                      >
                        Espace Patient
                      </button>
                    </TooltipTrigger>
                    {isPractitioner === true && (
                      <TooltipContent>
                        <p>Vous êtes connecté en tant que praticien</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </li>
                <li>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => navigate(ROUTES.DASHBOARD_PRACTITIONER)}
                        disabled={user !== null && isPractitioner === false}
                        aria-disabled={user !== null && isPractitioner === false}
                        className={`text-sm transition-colors ${
                          user !== null && isPractitioner === false
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-muted-foreground hover:text-primary"
                        }`}
                      >
                        Espace Praticien
                      </button>
                    </TooltipTrigger>
                    {user !== null && isPractitioner === false && (
                      <TooltipContent>
                        <p>Vous êtes connecté en tant que patient</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </li>
              </ul>
            </TooltipProvider>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">Contact</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" aria-hidden="true" />
                <span>Urgence: <a href="tel:112" className="hover:text-primary">112</a></span>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" aria-hidden="true" />
                <Link
                  to={ROUTES.CONTACT}
                  className="hover:text-primary transition-colors"
                >
                  Nous contacter
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bas de page */}
        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} DomiCares. Tous droits réservés.
            </p>
            <nav aria-label="Liens légaux" className="flex gap-4">
              <Link
                to={ROUTES.TERMS}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Conditions d'utilisation
              </Link>
              <Link
                to={ROUTES.PRIVACY}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Politique de confidentialité
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
