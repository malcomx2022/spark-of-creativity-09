import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import PractitionerMap from '@/components/PractitionerMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Search, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';

const MAPBOX_TOKEN_STORAGE_KEY = 'mapboxToken';

const mockPractitioners: Omit<PractitionerLocation, 'distance'>[] = [
  {
    id: '1',
    name: 'Dr. Jean Martin',
    specialty: 'Médecin généraliste',
    address: '15 Rue de Rivoli, 75001 Paris',
    latitude: 48.8606,
    longitude: 2.3376,
    available: true,
    rating: 4.8,
    phone: '01 42 60 30 30'
  },
  {
    id: '2',
    name: 'Dr. Sophie Leclerc',
    specialty: 'Infirmier(ère)',
    address: '28 Avenue des Champs-Élysées, 75008 Paris',
    latitude: 48.8698,
    longitude: 2.3078,
    available: true,
    rating: 4.9,
    phone: '01 53 93 97 00'
  },
  {
    id: '3',
    name: 'Dr. Marie Dubois',
    specialty: 'Cardiologue',
    address: '45 Rue du Faubourg Saint-Honoré, 75008 Paris',
    latitude: 48.8708,
    longitude: 2.3161,
    available: false,
    rating: 4.7,
    phone: '01 42 65 74 40'
  },
  {
    id: '4',
    name: 'Dr. Pierre Rousseau',
    specialty: 'Kinésithérapeute',
    address: '12 Boulevard Saint-Germain, 75005 Paris',
    latitude: 48.8499,
    longitude: 2.3467,
    available: true,
    rating: 4.6,
    phone: '01 43 25 79 80'
  }
];

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function PractitionerSearch() {
  const envMapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

  const [mapboxToken, setMapboxToken] = useState('');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [practitioners, setPractitioners] = useState<PractitionerLocation[]>([]);
  const [filteredPractitioners, setFilteredPractitioners] = useState<PractitionerLocation[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [searchRadius, setSearchRadius] = useState<string>('5');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const savedToken = window.localStorage.getItem(MAPBOX_TOKEN_STORAGE_KEY);

      if (savedToken) {
        setMapboxToken(savedToken);
        setShowTokenInput(false);
        return;
      }

      if (envMapboxToken && envMapboxToken.trim().length > 0) {
        setMapboxToken(envMapboxToken);
        setShowTokenInput(false);
      }
    } catch (error) {
      console.error('Impossible de charger le token Mapbox sauvegardé:', error);
    }
  }, [envMapboxToken]);

  useEffect(() => {
    if (userLocation) {
      const practitionersWithDistance = mockPractitioners.map(p => ({
        ...p,
        distance: calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          p.latitude,
          p.longitude
        )
      })).sort((a, b) => a.distance - b.distance);
      
      setPractitioners(practitionersWithDistance);
      setFilteredPractitioners(practitionersWithDistance);
    }
  }, [userLocation]);

  useEffect(() => {
    let filtered = practitioners;
    
    if (selectedSpecialty !== 'all') {
      filtered = filtered.filter(p => p.specialty === selectedSpecialty);
    }
    
    const radius = parseFloat(searchRadius);
    filtered = filtered.filter(p => !p.distance || p.distance <= radius);
    
    setFilteredPractitioners(filtered);
  }, [practitioners, selectedSpecialty, searchRadius]);

  const getUserLocation = () => {
    setIsLoadingLocation(true);
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          toast({
            title: 'Position obtenue',
            description: 'Votre position a été localisée avec succès.'
          });
          setIsLoadingLocation(false);
        },
        (error) => {
          console.error('Erreur de géolocalisation:', error);
          toast({
            title: 'Erreur',
            description: 'Impossible d\'obtenir votre position.',
            variant: 'destructive'
          });
          setIsLoadingLocation(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      toast({
        title: 'Non supporté',
        description: 'La géolocalisation n\'est pas supportée par votre navigateur.',
        variant: 'destructive'
      });
      setIsLoadingLocation(false);
    }
  };

  const handleTokenSubmit = () => {
    const trimmedToken = mapboxToken.trim();

    if (trimmedToken) {
      if (typeof window === 'undefined') {
        setMapboxToken(trimmedToken);
        setShowTokenInput(false);
        toast({
          title: 'Token configuré',
          description: 'Vous pouvez maintenant utiliser la carte.'
        });
        return;
      }

      try {
        window.localStorage.setItem(MAPBOX_TOKEN_STORAGE_KEY, trimmedToken);
      } catch (error) {
        console.error('Impossible de sauvegarder le token Mapbox:', error);
      }

      setMapboxToken(trimmedToken);
      setShowTokenInput(false);
      toast({
        title: 'Token configuré',
        description: 'Vous pouvez maintenant utiliser la carte.'
      });
    }
  };

  const specialties = Array.from(new Set(mockPractitioners.map(p => p.specialty)));

  if (showTokenInput) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
        <Header />
        <main className="container mx-auto px-4 py-8 pt-24">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Configuration Mapbox
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm">
                  Pour utiliser la carte, vous devez fournir un token Mapbox public.
                </p>
                <p className="text-sm text-muted-foreground">
                  Obtenez votre token sur{' '}
                  <a 
                    href="https://mapbox.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    mapbox.com
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">
                  Le token saisi est mémorisé localement pour vos prochaines visites.
                </p>
              </div>
              <Input
                type="text"
                placeholder="pk.eyJ1IjoiZXhhbXBsZS..."
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
              />
              <Button 
                onClick={handleTokenSubmit} 
                className="w-full"
                disabled={!mapboxToken.trim()}
              >
                Valider
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-2">Rechercher un praticien</h1>
          <p className="text-muted-foreground">Trouvez les professionnels de santé près de chez vous</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Filtres de recherche
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Ma position</label>
                <Button 
                  onClick={getUserLocation} 
                  disabled={isLoadingLocation}
                  className="w-full"
                  variant={userLocation ? "outline" : "default"}
                >
                  {isLoadingLocation ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Localisation...
                    </>
                  ) : userLocation ? (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      Position obtenue
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      Me localiser
                    </>
                  )}
                </Button>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Spécialité</label>
                <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les spécialités</SelectItem>
                    {specialties.map(specialty => (
                      <SelectItem key={specialty} value={specialty}>
                        {specialty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Rayon de recherche: {searchRadius} km
                </label>
                <Input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-semibold mb-3">
                  Praticiens trouvés ({filteredPractitioners.length})
                </h3>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {filteredPractitioners.map(practitioner => (
                    <Card key={practitioner.id} className="p-3">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-sm">{practitioner.name}</h4>
                        <p className="text-xs text-muted-foreground">{practitioner.specialty}</p>
                        {practitioner.distance && (
                          <p className="text-xs font-medium text-primary">
                            {practitioner.distance.toFixed(1)} km
                          </p>
                        )}
                        {!practitioner.available && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            Non disponible
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 h-[600px] relative">
            <div className="absolute right-4 top-4 z-10 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTokenInput(true)}
              >
                Modifier le token Mapbox
              </Button>
            </div>
            <PractitionerMap
              practitioners={filteredPractitioners}
              userLocation={userLocation}
              mapboxToken={mapboxToken}
              onPractitionerSelect={(practitioner) => {
                toast({
                  title: 'Praticien sélectionné',
                  description: `${practitioner.name} - ${practitioner.specialty}`
                });
              }}
            />
          </Card>
        </div>
      </main>
    </div>
  );
}
