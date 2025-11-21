import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { Phone, Mail } from "lucide-react";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Footer() {
  const navigate = useNavigate();
  const { data: user } = useSupabaseUser();

  const { data: isPractitioner } = useQuery({
    queryKey: ['user-type', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data } = await supabase
        .from('practitioners')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user?.id,
  });

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
                  disabled={isPractitioner === true}
                  className={`text-sm transition-colors ${
                    isPractitioner === true
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  Espace Patient
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("/dashboard/practitioner")}
                  disabled={user !== null && isPractitioner === false}
                  className={`text-sm transition-colors ${
                    user !== null && isPractitioner === false
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:text-primary"
                  }`}
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
                onClick={() => navigate("/terms-of-service")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Conditions d'utilisation
              </button>
              <button
                onClick={() => navigate("/privacy-policy")}
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
