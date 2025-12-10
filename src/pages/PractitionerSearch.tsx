import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LazyPractitionerMap from '@/components/LazyPractitionerMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Search, Loader2, AlertCircle, LogIn, Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';
import { usePractitioners } from '@/hooks/usePractitioners';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useCreateAppointment } from '@/hooks/useAppointments';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Star, Phone, Navigation } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { getCategoryLabel } from '@/lib/practitioner-categories';
import { useSearchActivityLog } from '@/hooks/useSearchActivityLog';

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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchRadius, setSearchRadius] = useState<string>('50');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPractitioner, setSelectedPractitioner] = useState<PractitionerLocation | null>(null);
  const [viewedPractitioner, setViewedPractitioner] = useState<PractitionerLocation | null>(null);

  const { data: user } = useSupabaseUser();
  const { logActivity, isAuthenticated } = useSearchActivityLog();
  
  // Hook pour créer les rendez-vous (avec notifications automatiques)
  const patientId = user?.id;
  const patientName = (user?.user_metadata?.full_name as string) || user?.email || 'Patient';
  const createAppointment = useCreateAppointment(patientId, patientName);
  
  // Utiliser le hook de géolocalisation amélioré
  const { position, requestPosition, loading: geoLoading, error: geoError, quality, isRefining } = useGeolocation();

  // Log page view on mount
  useEffect(() => {
    logActivity({ actionType: 'view_search_page' });
  }, [logActivity]);

  // Log filter changes with debounce
  const handleCategoryChange = useCallback((value: string) => {
    setSelectedCategory(value);
    logActivity({ 
      actionType: 'filter_specialty', 
      searchFilters: { category: value } 
    });
  }, [logActivity]);

  const handleViewPractitionerDetails = useCallback((practitioner: PractitionerLocation) => {
    setViewedPractitioner(practitioner);
    logActivity({ 
      actionType: 'view_practitioner_details', 
      practitionerId: practitioner.id,
      metadata: { practitioner_name: practitioner.name, specialty: practitioner.specialty }
    });
  }, [logActivity]);

  const handleClickContact = useCallback((practitioner: PractitionerLocation) => {
    logActivity({ 
      actionType: 'click_contact', 
      practitionerId: practitioner.id 
    });
  }, [logActivity]);

  const handleClickAppointment = useCallback((practitioner: PractitionerLocation) => {
    logActivity({ 
      actionType: 'click_appointment', 
      practitionerId: practitioner.id 
    });
    
    if (!user) {
      toast({
        title: 'Connexion requise',
        description: 'Veuillez vous connecter pour demander un rendez-vous.',
        variant: 'destructive'
      });
      navigate('/patient-login?redirect=/search-practitioners');
      return;
    }
    setSelectedPractitioner(practitioner);
  }, [logActivity, user, navigate]);

  const handleClickItinerary = useCallback((practitioner: PractitionerLocation) => {
    logActivity({ 
      actionType: 'click_itinerary', 
      practitionerId: practitioner.id 
    });
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${practitioner.latitude},${practitioner.longitude}`,
      '_blank'
    );
  }, [logActivity]);

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

    // Enrichir les praticiens avec la distance si les coordonnées sont disponibles
    const enriched = practitionersData.map(practitioner => {
      // Vérifier si le praticien a des coordonnées GPS valides (non nulles et non 0,0)
      const hasValidCoords = practitioner.latitude != null && 
                             practitioner.longitude != null && 
                             !isNaN(practitioner.latitude) && 
                             !isNaN(practitioner.longitude) &&
                             practitioner.latitude !== 0 && 
                             practitioner.longitude !== 0;

      if (!userLocation || !hasValidCoords) {
        // Sans coordonnées valides, pas de calcul de distance
        return { ...practitioner, distance: undefined };
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

    // Trier par distance si disponible
    const sorted = [...enriched].sort((a, b) => {
      // Praticiens avec distance en premier, triés par proximité
      if (a.distance !== undefined && b.distance !== undefined) {
        return a.distance - b.distance;
      }
      // Praticiens avec distance avant ceux sans
      if (a.distance !== undefined) return -1;
      if (b.distance !== undefined) return 1;
      // Pour ceux sans distance, trier par nom
      return a.name.localeCompare(b.name);
    });

    setPractitioners(sorted);
  }, [practitionersData, userLocation]);

  useEffect(() => {
    let filtered = practitioners;

    // Filtrer par recherche textuelle (nom, spécialité, zone)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.specialty.toLowerCase().includes(query) ||
        p.address?.toLowerCase().includes(query) ||
        p.intervention_zone?.toLowerCase().includes(query) ||
        p.communes_served?.some(c => c.toLowerCase().includes(query))
      );
    }

    // Filtrer par catégorie
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.practitioner_type === selectedCategory);
    }

    // Filtrer par rayon de recherche (uniquement si on a la position utilisateur)
    const radius = parseFloat(searchRadius);
    if (!Number.isNaN(radius) && userLocation) {
      filtered = filtered.filter(p => {
        // Si pas de distance calculée, ne pas inclure dans le filtrage par rayon
        // (sauf si aucune distance n'est disponible pour aucun praticien)
        if (p.distance === undefined) {
          // Vérifier si au moins un praticien a une distance
          const anyHasDistance = practitioners.some(pr => pr.distance !== undefined);
          // Si aucun n'a de distance, on garde tous les praticiens
          return !anyHasDistance;
        }
        return p.distance <= radius;
      });
    }

    setFilteredPractitioners(filtered);
  }, [practitioners, selectedCategory, searchRadius, userLocation, searchQuery]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(practitionersData.map(p => p.practitioner_type).filter(Boolean)))],
    [practitionersData]
  );

  const getUserLocation = () => {
    requestPosition();
  };



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
                    <Input 
                      placeholder="Rechercher par nom, spécialité ou zone..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category === 'all' ? 'Toutes les catégories' : getCategoryLabel(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rayon :</span>
                  <Select value={searchRadius} onValueChange={setSearchRadius} disabled={!userLocation}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Rayon" />
                    </SelectTrigger>
                    <SelectContent>
                      {['5', '10', '25', '50', '75', '100'].map(radius => (
                        <SelectItem key={radius} value={radius}>
                          {radius} km
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!userLocation && (
                    <span className="text-xs text-muted-foreground">
                      (Activez la géolocalisation pour filtrer par distance)
                    </span>
                  )}
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
                          {/* Afficher zone d'intervention ou adresse générique, jamais les coordonnées GPS */}
                          {practitioner.intervention_zone || practitioner.address || 'Zone non précisée'}
                          {typeof practitioner.distance === 'number' && userLocation && (
                            <span className="text-xs font-medium text-primary">
                              ({practitioner.distance.toFixed(1)} km)
                            </span>
                          )}
                        </p>
                        {practitioner.communes_served && practitioner.communes_served.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Communes: {practitioner.communes_served.slice(0, 3).join(', ')}
                            {practitioner.communes_served.length > 3 && '...'}
                          </p>
                        )}
                      </div>
                       <div className="flex items-center justify-between flex-wrap gap-2">
                        {/* Bouton Contacter - masqué pour anonymes */}
                        {isAuthenticated ? (
                          practitioner.phone ? (
                            <Button asChild onClick={() => handleClickContact(practitioner)}>
                              <a href={`tel:${practitioner.phone}`}>
                                <Phone className="h-4 w-4 mr-2" />
                                Contacter
                              </a>
                            </Button>
                          ) : (
                            <Button disabled variant="outline">
                              <Phone className="h-4 w-4 mr-2" />
                              Non disponible
                            </Button>
                          )
                        ) : (
                          <Button 
                            variant="outline" 
                            onClick={() => navigate('/patient-login?redirect=/search-practitioners')}
                          >
                            <Lock className="h-4 w-4 mr-2" />
                            Connectez-vous pour contacter
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          onClick={() => handleClickAppointment(practitioner)}
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
                      onPractitionerSelect={handleViewPractitionerDetails}
                      mapboxToken={mapboxToken}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Dialog de prise de rendez-vous avec praticien pré-sélectionné */}
      <NewAppointmentDialog
        open={!!selectedPractitioner && !!user}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPractitioner(null);
          }
        }}
        preselectedPractitioner={selectedPractitioner ? {
          id: selectedPractitioner.id,
          name: selectedPractitioner.name,
          specialty: selectedPractitioner.specialty
        } : undefined}
        onSubmit={async (data) => {
          if (!selectedPractitioner || !user) {
            throw new Error('Praticien ou utilisateur non défini');
          }
          
          try {
            // Utiliser le hook useCreateAppointment qui envoie automatiquement les notifications
            const appointment = await createAppointment.mutateAsync({
              specialty: data.specialty || selectedPractitioner.specialty,
              date: data.date,
              time: data.time,
              reason: data.reason,
              urgencyLevel: data.urgencyLevel,
              practitionerId: selectedPractitioner.id,
              practitionerName: selectedPractitioner.name,
              addressOverride: data.addressOverride || selectedPractitioner.address || 'Adresse à confirmer',
            });

            // Log l'activité de création de RDV
            logActivity({
              actionType: 'appointment_created',
              practitionerId: selectedPractitioner.id,
              metadata: { 
                appointment_id: appointment.id,
                practitioner_name: selectedPractitioner.name 
              }
            });

            toast({
              title: '✅ Demande envoyée',
              description: `Votre demande de rendez-vous a été envoyée à ${selectedPractitioner.name}. Vous serez notifié dès qu'il aura accepté.`,
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
                    <p className="font-medium">Localisation</p>
                    {isAuthenticated ? (
                      <>
                        <p className="text-muted-foreground">{viewedPractitioner.address}</p>
                        {typeof viewedPractitioner.distance === 'number' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            À {viewedPractitioner.distance.toFixed(1)} km de vous
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-3 mt-1">
                        <p className="text-muted-foreground">
                          {viewedPractitioner.intervention_zone || 'Zone d\'intervention non précisée'}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-sm text-primary">
                          <Lock className="h-4 w-4" />
                          <span>Connectez-vous pour voir l'adresse exacte</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isAuthenticated && viewedPractitioner.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Téléphone</p>
                      <p className="text-muted-foreground">{viewedPractitioner.phone}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bannière pour utilisateurs anonymes */}
              {!isAuthenticated && (
                <Alert className="bg-primary/5 border-primary/20">
                  <LogIn className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">Connectez-vous pour plus de détails</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Accédez à l'adresse exacte, au numéro de téléphone et à l'itinéraire vers ce praticien.
                    </p>
                    <Button 
                      size="sm" 
                      className="mt-2"
                      onClick={() => navigate('/patient-login?redirect=/search-practitioners')}
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Se connecter / S'inscrire
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button 
                  className="flex-1"
                  onClick={() => {
                    handleClickAppointment(viewedPractitioner);
                    if (user) {
                      setViewedPractitioner(null);
                    }
                  }}
                >
                  Demander un rendez-vous
                </Button>
                {/* Bouton Itinéraire - uniquement pour utilisateurs connectés avec GPS disponible */}
                {isAuthenticated && viewedPractitioner.latitude !== 0 && viewedPractitioner.longitude !== 0 && (
                  <Button 
                    variant="outline"
                    onClick={() => handleClickItinerary(viewedPractitioner)}
                  >
                    <Navigation className="h-4 w-4 mr-2" />
                    Itinéraire
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      <Footer />
    </div>
  );
}
