import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [practitioners, setPractitioners] = useState<PractitionerLocation[]>([]);
  const [filteredPractitioners, setFilteredPractitioners] = useState<PractitionerLocation[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [searchRadius, setSearchRadius] = useState<string>('15');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

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

  const specialties = Array.from(new Set(mockPractitioners.map(p => p.specialty)));

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
                      {['5', '10', '15'].map(radius => (
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

          <Card className="lg:col-span-2 h-[600px] flex items-center justify-center bg-muted">
            {mapboxToken ? (
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
            ) : (
              <div className="text-center p-4">
                <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Carte non disponible</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Le token Mapbox n'est pas configuré. Veuillez contacter l'administrateur.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  (Variable d'environnement VITE_MAPBOX_TOKEN manquante)
                </p>
              </div>
            )}
          </Card>
        </div>
      </main>

      {selectedPractitioner && user && (
        <NewAppointmentDialog
          onSubmit={async (data) => {
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

            setSelectedPractitioner(null);
            return appointment;
          }}
        />
      )}
      <Footer />
    </div>
  );
}