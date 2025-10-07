import { Button } from "@/components/ui/button";
import { Heart, Menu, Phone, MapPin } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
              <Heart className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">DomiCares</h1>
              <p className="text-xs text-muted-foreground">Soins à domicile</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <a href="#services" className="text-foreground hover:text-primary transition-colors">
              Services
            </a>
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
          </nav>

          {/* Emergency Button */}
          <div className="flex items-center space-x-3">
            <Button variant="urgent" size="sm" className="hidden sm:flex">
              <Phone className="h-4 w-4" />
              Urgence 112
            </Button>
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
              <a href="#services" className="text-foreground hover:text-primary transition-colors">
                Services
              </a>
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
              <Button variant="urgent" size="sm" className="w-full sm:hidden">
                <Phone className="h-4 w-4" />
                Urgence 112
              </Button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}