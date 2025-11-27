import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LazyPractitionerMap from '@/components/LazyPractitionerMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Search, Loader2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';
import { usePractitioners } from '@/hooks/usePractitioners';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Star, Phone, Navigation } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

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
  const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [practitioners, setPractitioners] = useState<PractitionerLocation[]>([]);
  const [filteredPractitioners, setFilteredPractitioners] = useState<PractitionerLocation[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [searchRadius, setSearchRadius] = useState<string>('100');
  const [selectedPractitioner, setSelectedPractitioner] = useState<PractitionerLocation | null>(null);
  const [viewedPractitioner, setViewedPractitioner] = useState<PractitionerLocation | null>(null);

  const { data: user } = useSupabaseUser();
  
  // Utiliser le hook de géolocalisation amélioré
  const { position, requestPosition, loading: geoLoading, error: geoError, quality, isRefining } = useGeolocation();

  // Récupérer le token Mapbox via l'edge function
  const { data: mapboxData, isLoading: isLoadingMapbox } = useQuery({
    queryKey: ['mapbox-token'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-mapbox-token');
      if (error) throw error;
      return data;
    },
  });

  const mapboxToken = mapboxData?.token || '';

  const {
    data: practitionersData = [],
    isLoading: isLoadingPractitioners,
    isError: isPractitionerError,
    error: practitionerError,
  } = usePractitioners();

  // Demander automatiquement la géolocalisation au chargement de la page
  useEffect(() => {
    // Ne demander qu'une seule fois au montage
    requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionnellement vide - on ne veut déclencher qu'une fois

  // Mettre à jour userLocation quand position change
  useEffect(() => {
    if (position) {
      setUserLocation({
        latitude: position.latitude,
        longitude: position.longitude,
      });
      
      // Afficher un toast uniquement si la qualité est bonne
      if (quality && quality.level !== 'poor') {
        toast({
          title: '📍 Position obtenue',
          description: quality.message,
        });
      }
    }
  }, [position, quality]);

  useEffect(() => {
    if (practitionersData.length === 0) {
      setPractitioners([]);
      setFilteredPractitioners([]);
      return;
    }

    // Filtrer les praticiens avec des coordonnées GPS valides pour la carte
    const validPractitioners = practitionersData.filter(
      p => p.latitude != null && p.longitude != null && 
           !isNaN(p.latitude) && !isNaN(p.longitude) &&
           p.latitude !== 0 && p.longitude !== 0
    );

    const enriched = validPractitioners.map(practitioner => {
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

    // Si l'utilisateur a une position, filtrer par rayon
    // Sinon, afficher tous les praticiens valides
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
    requestPosition();
  };

  const specialties = Array.from(new Set(mockPractitioners.map(p => p.specialty)));

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8 pt-20 sm:pt-24">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between">
              <h1 className="text-2xl sm:text-3xl font-bold">Trouver un praticien</h1>
              <div className="flex items-center gap-2">
                <Button onClick={getUserLocation} disabled={geoLoading || isRefining} className="min-h-[44px]">
                  {geoLoading || isRefining ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span className="hidden sm:inline">{isRefining ? 'Affinage...' : 'Localisation en cours...'}</span>
                      <span className="sm:hidden">Position...</span>
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

            {position && quality && (
              <Alert className={cn(
                "border-2",
                quality.level === 'excellent' ? "bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700" :
                quality.level === 'good' ? "bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700" :
                quality.level === 'fair' ? "bg-yellow-50 border-yellow-300 dark:bg-yellow-950 dark:border-yellow-700" :
                "bg-orange-50 border-orange-300 dark:bg-orange-950 dark:border-orange-700"
              )}>
                <MapPin className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className={cn("font-medium", quality.color)}>
                      {quality.message}
                    </div>
                    {quality.level === 'poor' && (
                      <p className="text-xs text-muted-foreground">
                        Les résultats sont affichés mais la distance peut être imprécise. 
                        Essayez de vous rapprocher d'une fenêtre ou d'un lieu ouvert pour une meilleure précision.
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {geoError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="font-medium">{geoError}</div>
                    {geoError.includes('Permission') && (
                      <p className="text-xs mt-1">
                        Pour activer la géolocalisation: Menu navigateur → Paramètres du site → Localisation → Autoriser
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

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
                      {['5', '10', '25', '40', '55', '70', '85', '100'].map(radius => (
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
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center gap-3 text-destructive">
                      <AlertCircle className="h-12 w-12" />
                      <div className="text-center">
                        <p className="font-semibold">Impossible de charger les praticiens</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {practitionerError?.message || 'Erreur de connexion'}
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-4"
                          onClick={() => window.location.reload()}
                        >
                          Réessayer
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : isLoadingPractitioners ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Chargement des praticiens...</p>
                    </div>
                  </CardContent>
                </Card>
              ) : practitionersData.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <AlertCircle className="h-12 w-12" />
                      <p>Aucun praticien disponible pour le moment.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : filteredPractitioners.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <AlertCircle className="h-12 w-12" />
                      <div className="text-center">
                        <p className="font-semibold">Aucun praticien trouvé</p>
                        <p className="text-sm mt-1">
                          Essayez d'élargir votre rayon de recherche ou de changer la spécialité
                        </p>
                      </div>
                    </div>
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
                        <Button 
                          asChild
                          disabled={!practitioner.phone}
                        >
                          <a href={practitioner.phone ? `tel:${practitioner.phone}` : undefined}>
                            <Phone className="h-4 w-4 mr-2" />
                            Contacter
                          </a>
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            if (!user) {
                              toast({
                                title: 'Connexion requise',
                                description: 'Veuillez vous connecter pour demander un rendez-vous.',
                                variant: 'destructive'
                              });
                              navigate('/login');
                              return;
                            }
                            setSelectedPractitioner(practitioner);
                          }}
                        >
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
                <div className="h-[500px]">
                  {isLoadingMapbox ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !mapboxToken ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Carte non disponible</p>
                        <p className="text-xs mt-1">Configuration Mapbox requise</p>
                      </div>
                    </div>
                  ) : (
                    <LazyPractitionerMap
                      practitioners={filteredPractitioners}
                      userLocation={userLocation}
                      onPractitionerSelect={setViewedPractitioner}
                      mapboxToken={mapboxToken}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {selectedPractitioner && user && (
        <NewAppointmentDialog
          onSubmit={async (data) => {
            try {
              const { data: session } = await supabase.auth.getSession();
              if (!session?.session?.user) {
                throw new Error('Utilisateur non authentifié');
              }

              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', session.session.user.id)
                .single();

              const appointmentData = {
                patient_id: session.session.user.id,
                patient_name: profile?.full_name || 'Patient',
                practitioner_id: selectedPractitioner.id,
                practitioner_name: selectedPractitioner.name,
                specialty: data.specialty,
                date: new Date(data.date).toISOString().split('T')[0],
                time: data.time,
                status: 'awaiting_practitioner',
                address: selectedPractitioner.address,
                reason: data.reason,
                urgency_level: data.urgencyLevel,
              };

              const { data: appointment, error } = await supabase
                .from('appointments')
                .insert([appointmentData])
                .select()
                .single();

              if (error) throw error;

              toast({
                title: 'Demande envoyée',
                description: 'Votre demande de rendez-vous a été envoyée avec succès.',
              });

              setSelectedPractitioner(null);
              return appointment;
            } catch (error) {
              console.error('Erreur création RDV:', error);
              toast({
                title: 'Erreur',
                description: error instanceof Error ? error.message : 'Impossible de créer le rendez-vous',
                variant: 'destructive'
              });
              throw error;
            }
          }}
        />
      )}

      {viewedPractitioner && (
        <Dialog open={!!viewedPractitioner} onOpenChange={() => setViewedPractitioner(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                {viewedPractitioner.name}
                <span className="text-sm font-normal text-muted-foreground">
                  ({viewedPractitioner.specialty})
                </span>
              </DialogTitle>
              <DialogDescription className="sr-only">
                Détails du praticien {viewedPractitioner.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {viewedPractitioner.image && (
                <img 
                  src={viewedPractitioner.image} 
                  alt={viewedPractitioner.name}
                  className="w-full h-48 object-cover rounded-lg"
                />
              )}
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${
                        i < Math.round(viewedPractitioner.rating || 0)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">
                    ({viewedPractitioner.rating?.toFixed(1)})
                  </span>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  viewedPractitioner.available 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  {viewedPractitioner.available ? 'Disponible' : 'Indisponible'}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Adresse</p>
                    <p className="text-muted-foreground">{viewedPractitioner.address}</p>
                    {typeof viewedPractitioner.distance === 'number' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        À {viewedPractitioner.distance.toFixed(1)} km de vous
                      </p>
                    )}
                  </div>
                </div>

                {viewedPractitioner.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Téléphone</p>
                      <p className="text-muted-foreground">{viewedPractitioner.phone}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button 
                  className="flex-1"
                  onClick={() => {
                    if (!user) {
                      toast({
                        title: 'Connexion requise',
                        description: 'Veuillez vous connecter pour demander un rendez-vous.',
                        variant: 'destructive'
                      });
                      navigate('/login');
                      return;
                    }
                    setSelectedPractitioner(viewedPractitioner);
                    setViewedPractitioner(null);
                  }}
                >
                  Demander un rendez-vous
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${viewedPractitioner.latitude},${viewedPractitioner.longitude}`,
                      '_blank'
                    );
                  }}
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Itinéraire
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      <Footer />
    </div>
  );
}