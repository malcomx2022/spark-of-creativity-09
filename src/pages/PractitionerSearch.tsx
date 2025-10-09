import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/Header';
import PractitionerMap from '@/components/PractitionerMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Search, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';
import { usePractitioners } from '@/hooks/usePractitioners';

const MAPBOX_TOKEN_STORAGE_KEY = 'mapboxToken';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  const {
    data: practitionersData = [],
    isLoading: isLoadingPractitioners,
    isError: isPractitionerError,
  } = usePractitioners();

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
    if (practitionersData.length === 0) {
      setPractitioners([]);
      setFilteredPractitioners([]);
      return;
    }

    const enriched = practitionersData.map(practitioner => {
      if (!userLocation) {
        return practitioner;
      }

      return {
        ...practitioner,
        distance: calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          practitioner.latitude,
          practitioner.longitude
        ),
      };
    });

    const sorted = userLocation
      ? [...enriched].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      : enriched;

    setPractitioners(sorted);
  }, [practitionersData, userLocation]);

  useEffect(() => {
    let filtered = practitioners;

    if (selectedSpecialty !== 'all') {
      filtered = filtered.filter(p => p.specialty === selectedSpecialty);
    }

    const radius = parseFloat(searchRadius);
    if (!Number.isNaN(radius) && userLocation) {
      filtered = filtered.filter(p => (p.distance ?? Infinity) <= radius);
    }

    setFilteredPractitioners(filtered);
  }, [practitioners, selectedSpecialty, searchRadius, userLocation]);

  const specialties = useMemo(
    () => ['all', ...Array.from(new Set(practitionersData.map(p => p.specialty)))],
    [practitionersData]
  );

  const getUserLocation = () => {
    setIsLoadingLocation(true);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        position => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          toast({
            title: 'Position obtenue',
            description: 'Votre position a été localisée avec succès.'
          });
          setIsLoadingLocation(false);
        },
        error => {
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

    if (!trimmedToken) {
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MAPBOX_TOKEN_STORAGE_KEY, trimmedToken);
      } catch (error) {
        console.error('Impossible de sauvegarder le token Mapbox:', error);
      }
    }

    setMapboxToken(trimmedToken);
    setShowTokenInput(false);
    toast({
      title: 'Token configuré',
      description: 'Vous pouvez maintenant utiliser la carte.'
    });
  };

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
                onChange={event => setMapboxToken(event.target.value)}
              />
              <Button className="w-full" onClick={handleTokenSubmit}>
                Enregistrer le token
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
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h1 className="text-3xl font-bold">Trouver un praticien</h1>
              <div className="flex items-center gap-2">
                <Button onClick={getUserLocation} disabled={isLoadingLocation}>
                  {isLoadingLocation ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Localisation en cours...
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      Ma position
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="md:col-span-2 flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Rechercher un praticien" />
                  </div>
                  <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                    <SelectTrigger>
                      <SelectValue placeholder="Spécialité" />
                    </SelectTrigger>
                    <SelectContent>
                      {specialties.map(specialty => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty === 'all' ? 'Toutes les spécialités' : specialty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rayon de recherche :</span>
                  <Select value={searchRadius} onValueChange={setSearchRadius}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Rayon" />
                    </SelectTrigger>
                    <SelectContent>
                      {['5', '10', '20', '50'].map(radius => (
                        <SelectItem key={radius} value={radius}>
                          {radius} km
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {isPractitionerError ? (
                <Card>
                  <CardContent className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Impossible de charger les praticiens.
                  </CardContent>
                </Card>
              ) : isLoadingPractitioners ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Chargement des praticiens...</span>
                </div>
              ) : filteredPractitioners.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center gap-2 text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    Aucun praticien ne correspond à votre recherche.
                  </CardContent>
                </Card>
              ) : (
                filteredPractitioners.map(practitioner => (
                  <Card key={practitioner.id}>
                    <CardHeader>
                      <CardTitle className="flex justify-between items-start">
                        <span>{practitioner.name}</span>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{practitioner.rating.toFixed(1)} ★</span>
                          <span className={practitioner.available ? 'text-green-500' : 'text-red-500'}>
                            {practitioner.available ? 'Disponible' : 'Indisponible'}
                          </span>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{practitioner.specialty}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2 mt-2">
                          <MapPin className="h-4 w-4" />
                          {practitioner.address}
                          {typeof practitioner.distance === 'number' && (
                            <span className="text-xs text-muted-foreground">
                              ({practitioner.distance.toFixed(1)} km)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <Button onClick={() => toast({ title: 'Contact', description: `Appel en cours vers ${practitioner.phone}` })}>
                          Contacter
                        </Button>
                        <Button variant="outline" onClick={() => toast({ title: 'Demande envoyée', description: `Une demande de rendez-vous a été envoyée à ${practitioner.name}` })}>
                          Demander un rendez-vous
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Carte des praticiens
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mapboxToken ? (
                  <PractitionerMap
                    practitioners={filteredPractitioners}
                    userLocation={userLocation}
                    mapboxToken={mapboxToken}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Token Mapbox requis pour afficher la carte.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
