import { Button } from "@/components/ui/button";
import { Menu, Phone, MapPin, LogIn, UserPlus, Users, ChevronDown, X } from "lucide-react";
import { useState, useId } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "@/lib/api";
import { AUTH_USER_QUERY_KEY, useAuthUser } from "@/hooks/useAuthUser";
import { getDashboardPathForUser } from "@/lib/dashboardNavigation";
import { ROUTES } from "@/lib/routes";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: user } = useAuthUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mobileMenuId = useId();

  const handleEmergencyCall = () => {
    if (typeof window !== 'undefined' && 'ontouchstart' in window) {
      // Mobile: utiliser tel:
      window.location.href = 'tel:112';
    } else {
      // Desktop: afficher un message
      toast({
        title: '📞 Numéro d\'urgence: 112',
        description: 'Composez le 112 depuis votre téléphone pour joindre les urgences médicales.',
        duration: 8000,
      });
    }
  };

  const handleLogout = async () => {
    // Marquer la déconnexion en cours AVANT signOut
    sessionStorage.setItem('logging_out', 'true');
    
    // Invalider immédiatement le cache utilisateur pour que l'UI se mette à jour
    queryClient.setQueryData(AUTH_USER_QUERY_KEY, null);
    queryClient.invalidateQueries({ queryKey: AUTH_USER_QUERY_KEY });
    
    // Nettoyer les données de l'app
    const keysToRemove = [
      'recent_location_searches',
      'payment_state',
      'user_preferences'
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    await auth.signOut();
    
    // Fermer le menu mobile si ouvert
    setIsMenuOpen(false);
    
    // Naviguer vers la page d'accueil
    navigate(ROUTES.HOME, { replace: true });
  };

  return (
    <header className="app-header fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-3 sm:px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link
            to={ROUTES.HOME}
            className="flex items-center space-x-1.5 sm:space-x-2 hover:opacity-80 transition-opacity"
            aria-label="DomiCares - Retour à l'accueil"
          >
            <img src={logo} alt="" className="w-8 h-8 sm:w-10 sm:h-10" aria-hidden="true" />
            <div>
              <span className="text-base sm:text-xl font-bold text-foreground block">DomiCares</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground block">Soins à domicile</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6" aria-label="Navigation principale">
            <Link
              to={ROUTES.HOME}
              className="text-foreground hover:text-primary transition-colors"
            >
              Accueil
            </Link>
            <Link
              to={ROUTES.SERVICES}
              className="text-foreground hover:text-primary transition-colors"
            >
              Services
            </Link>
            {user && (
              <button
                onClick={async () => {
                  try {
                    const path = await getDashboardPathForUser(user.id);
                    navigate(path);
                  } catch {
                    toast({
                      title: 'Erreur',
                      description: 'Impossible d\'accéder à votre espace.',
                      variant: 'destructive'
                    });
                  }
                }}
                className="text-foreground hover:text-primary transition-colors"
              >
                Mon espace
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="text-foreground hover:text-primary transition-colors flex items-center gap-1"
                aria-label="Menu de recherche"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Recherche
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(ROUTES.SEARCH_PRACTITIONERS)}>
                  <MapPin className="h-4 w-4 mr-2" aria-hidden="true" />
                  Praticiens médicaux
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(ROUTES.SEARCH_COACHES)}>
                  <Users className="h-4 w-4 mr-2" aria-hidden="true" />
                  Coachs sportifs
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          {/* Emergency Button & Auth */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Button
              variant="urgent"
              size="sm"
              className="hidden sm:flex min-h-[40px]"
              onClick={handleEmergencyCall}
              aria-label="Appeler les urgences au 112"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Urgence 112</span>
              <span className="md:hidden">112</span>
            </Button>

            {user ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="hidden md:flex"
              >
                Déconnexion
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(ROUTES.LOGIN_EMAIL)}
                  className="hidden md:flex"
                >
                  <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
                  Connexion
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate(ROUTES.SIGNUP)}
                  className="hidden md:flex"
                >
                  <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                  S'inscrire
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen}
              aria-controls={mobileMenuId}
              aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div
            id={mobileMenuId}
            className="md:hidden mt-4 pb-4 border-t border-border"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation mobile"
          >
            <nav className="flex flex-col space-y-3 pt-4" aria-label="Navigation mobile">
              <Link
                to={ROUTES.HOME}
                onClick={() => setIsMenuOpen(false)}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Accueil
              </Link>
              <Link
                to={ROUTES.SERVICES}
                onClick={() => setIsMenuOpen(false)}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Services
              </Link>
              {user && (
                <button
                  onClick={async () => {
                    setIsMenuOpen(false);
                    try {
                      const path = await getDashboardPathForUser(user.id);
                      navigate(path);
                    } catch {
                      toast({
                        title: 'Erreur',
                        description: 'Impossible d\'accéder à votre espace.',
                        variant: 'destructive'
                      });
                    }
                  }}
                  className="text-foreground hover:text-primary transition-colors text-left"
                >
                  Mon espace
                </button>
              )}
              <Link
                to={ROUTES.SEARCH_PRACTITIONERS}
                onClick={() => setIsMenuOpen(false)}
                className="text-foreground hover:text-primary transition-colors text-left flex items-center gap-2"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Praticiens médicaux
              </Link>
              <Link
                to={ROUTES.SEARCH_COACHES}
                onClick={() => setIsMenuOpen(false)}
                className="text-foreground hover:text-primary transition-colors text-left flex items-center gap-2"
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Coachs sportifs
              </Link>
              <Button
                variant="urgent"
                size="sm"
                className="w-full sm:hidden"
                onClick={handleEmergencyCall}
                aria-label="Appeler les urgences au 112"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                Urgence 112
              </Button>

              {user ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full"
                >
                  Déconnexion
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsMenuOpen(false);
                      navigate(ROUTES.LOGIN_EMAIL);
                    }}
                    className="w-full"
                  >
                    <LogIn className="h-4 w-4 mr-2" aria-hidden="true" />
                    Connexion
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setIsMenuOpen(false);
                      navigate(ROUTES.SIGNUP);
                    }}
                    className="w-full"
                  >
                    <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                    S'inscrire
                  </Button>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}