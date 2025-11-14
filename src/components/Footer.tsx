import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { Phone, Mail, MapPin } from "lucide-react";

export default function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="bg-secondary/10 border-t border-border mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo et Description */}
          <div className="col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <img src={logo} alt="DomiCares Logo" className="w-10 h-10" />
              <div>
                <h2 className="text-lg font-bold text-foreground">DomiCares</h2>
                <p className="text-xs text-muted-foreground">Soins à domicile</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Votre plateforme de confiance pour les soins de santé à domicile.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">Navigation</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => navigate("/")}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Accueil
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/services")}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Services
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/search-practitioners")}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Recherche
                </button>
              </li>
            </ul>
          </div>

          {/* Espaces */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">Espaces</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => navigate("/dashboard/patient")}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Espace Patient
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/dashboard/practitioner")}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Espace Praticien
                </button>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">Contact</h3>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>Urgence: 112</span>
              </li>
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <button
                  onClick={() => navigate("/contact")}
                  className="hover:text-primary transition-colors"
                >
                  Nous contacter
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bas de page */}
        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © 2024 DomiCares. Tous droits réservés.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => navigate("/terms")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Conditions d'utilisation
              </button>
              <button
                onClick={() => navigate("/privacy")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Politique de confidentialité
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
