import { Button } from "@/components/ui/button";
import { Menu, Phone, MapPin, LogIn, UserPlus, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import logo from "@/assets/logo.png";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => navigate("/")} className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <img src={logo} alt="DomiCares Logo" className="w-10 h-10" />
            <div>
              <h1 className="text-xl font-bold text-foreground">DomiCares</h1>
              <p className="text-xs text-muted-foreground">Soins à domicile</p>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <button 
              onClick={() => navigate("/")}
              className="text-foreground hover:text-primary transition-colors"
            >
              Accueil
            </button>
            <button 
              onClick={() => navigate("/services")}
              className="text-foreground hover:text-primary transition-colors"
            >
              Services
            </button>
            <button 
              onClick={() => navigate("/dashboard/patient")}
              className="text-foreground hover:text-primary transition-colors"
            >
              Patient
            </button>
            <button 
              onClick={() => navigate("/dashboard/practitioner")}
              className="text-foreground hover:text-primary transition-colors"
            >
              Praticien
            </button>
            <button 
              onClick={() => navigate("/triage")}
              className="text-foreground hover:text-primary transition-colors"
            >
              Triage
            </button>
            <button 
              onClick={() => navigate("/search-practitioners")}
              className="text-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <MapPin className="h-4 w-4" />
              Recherche
            </button>
            <button 
              onClick={() => navigate("/admin/login")}
              className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              title="Espace Administration"
            >
              <Shield className="h-4 w-4" />
            </button>
          </nav>

          {/* Emergency Button & Auth */}
          <div className="flex items-center space-x-3">
            <Button variant="urgent" size="sm" className="hidden sm:flex">
              <Phone className="h-4 w-4" />
              Urgence 112
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
                  onClick={() => navigate("/login")}
                  className="hidden md:flex"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Connexion
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => navigate("/signup")}
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
                onClick={() => navigate("/")}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Accueil
              </button>
              <button 
                onClick={() => navigate("/services")}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Services
              </button>
              <button 
                onClick={() => navigate("/dashboard/patient")}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Espace Patient
              </button>
              <button 
                onClick={() => navigate("/dashboard/practitioner")}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Espace Praticien
              </button>
              <button 
                onClick={() => navigate("/triage")}
                className="text-foreground hover:text-primary transition-colors text-left"
              >
                Triage Médical
              </button>
              <button 
                onClick={() => navigate("/search-practitioners")}
                className="text-foreground hover:text-primary transition-colors text-left flex items-center gap-2"
              >
                <MapPin className="h-4 w-4" />
                Rechercher un praticien
              </button>
              <button 
                onClick={() => navigate("/admin/login")}
                className="text-muted-foreground hover:text-primary transition-colors text-left flex items-center gap-2"
              >
                <Shield className="h-4 w-4" />
                Administration
              </button>
              <Button variant="urgent" size="sm" className="w-full sm:hidden">
                <Phone className="h-4 w-4" />
                Urgence 112
              </Button>
              
              {user ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  className="w-full"
                >
                  Déconnexion
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => navigate("/login")}
                    className="w-full"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    Connexion
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={() => navigate("/signup")}
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