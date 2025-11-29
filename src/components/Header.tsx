import { Button } from "@/components/ui/button";
import { Menu, Phone, MapPin, LogIn, UserPlus, Shield, Users, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseUser } from "@/hooks/useSupabaseUser";
import { getDashboardPathForUser } from "@/lib/dashboardNavigation";
import { ROUTES } from "@/lib/routes";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: user } = useSupabaseUser();
  const navigate = useNavigate();

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
    // Nettoyer seulement les données de l'app
    const keysToRemove = [
      'supabase.auth.token',
      'recent_location_searches',
      'payment_state',
      'user_preferences'
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    await supabase.auth.signOut();
    window.location.href = ROUTES.HOME;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-3 sm:px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => navigate(ROUTES.HOME)} className="flex items-center space-x-1.5 sm:space-x-2 hover:opacity-80 transition-opacity">
            <img src={logo} alt="DomiCares Logo" className="w-8 h-8 sm:w-10 sm:h-10" />
            <div>
              <h1 className="text-base sm:text-xl font-bold text-foreground">DomiCares</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Soins à domicile</p>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <button 
              onClick={() => navigate(ROUTES.HOME)}
              className="text-foreground hover:text-primary transition-colors"
            >
              Accueil
            </button>
            <button 
              onClick={() => {
                navigate(ROUTES.HOME);
                setTimeout(() => {
                  const element = document.getElementById('services');
                  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              className="text-foreground hover:text-primary transition-colors"
            >
              Services
            </button>
            {user && (
              <button 
                onClick={async () => {
                  const path = await getDashboardPathForUser(user.id);
                  navigate(path);
                }}
                className="text-foreground hover:text-primary transition-colors"
              >
                Mon espace
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger className="text-foreground hover:text-primary transition-colors flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                Recherche
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(ROUTES.SEARCH_PRACTITIONERS)}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Praticiens médicaux
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(ROUTES.SEARCH_COACHES)}>
                  <Users className="h-4 w-4 mr-2" />
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
            >
              <Phone className="h-4 w-4" />
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
                  onClick={() => navigate('/login-email')}
                  className="hidden md:flex"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Connexion
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => navigate(ROUTES.SIGNUP)}
                  className="hidden md:flex"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  S'inscrire
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-border">
            <nav className="flex flex-col space-y-3 pt-4">
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate(ROUTES.HOME);
                }}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Accueil
              </button>
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate(ROUTES.SERVICES);
                }}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Services
              </button>
              {user && (
                <button 
                  onClick={async () => {
                    setIsMenuOpen(false);
                    const path = await getDashboardPathForUser(user.id);
                    navigate(path);
                  }}
                  className="text-foreground hover:text-primary transition-colors text-left"
                >
                  Mon espace
                </button>
              )}
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate(ROUTES.SEARCH_PRACTITIONERS);
                }}
                className="text-foreground hover:text-primary transition-colors text-left flex items-center gap-2"
              >
                <MapPin className="h-4 w-4" />
                Praticiens médicaux
              </button>
              <button 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate(ROUTES.SEARCH_COACHES);
                }}
                className="text-foreground hover:text-primary transition-colors text-left flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Coachs sportifs
              </button>
              <Button 
                variant="urgent" 
                size="sm" 
                className="w-full sm:hidden"
                onClick={handleEmergencyCall}
              >
                <Phone className="h-4 w-4" />
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
                      navigate('/login-email');
                    }}
                    className="w-full"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
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
                    <UserPlus className="h-4 w-4 mr-2" />
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