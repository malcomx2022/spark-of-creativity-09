import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MapPin, Navigation, Loader2, Check, RefreshCw, Copy, MapPinned,
  Radius, Building2, HelpCircle, CheckCircle2, AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AddressSearchInput } from '@/components/AddressSearchInput';

interface LocationSectionProps {
  practitionerId: string;
  practitionerData: any;
}

export function LocationSection({ practitionerId, practitionerData }: LocationSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    address: practitionerData?.address || '',
    latitude: practitionerData?.latitude || null,
    longitude: practitionerData?.longitude || null,
  });

  useEffect(() => {
    setFormData({
      address: practitionerData?.address || '',
      latitude: practitionerData?.latitude || null,
      longitude: practitionerData?.longitude || null,
    });
  }, [practitionerData]);

  // Vérifier si la localisation est configurée
  const isLocationConfigured = useMemo(() => {
    return !!(practitionerData?.latitude && practitionerData?.longitude && practitionerData?.address);
  }, [practitionerData]);

  // Statistiques de la zone d'intervention
  const locationStats = useMemo(() => {
    return {
      hasAddress: !!practitionerData?.address,
      hasCoordinates: !!(practitionerData?.latitude && practitionerData?.longitude),
      radius: practitionerData?.intervention_radius || 0,
      communesCount: practitionerData?.communes_served?.length || 0,
    };
  }, [practitionerData]);

  // Fonction de rafraîchissement
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["practitioner", practitionerData?.user_id] });
      toast({
        title: "Actualisé",
        description: "Les données ont été rafraîchies.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de rafraîchir les données.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fonction de copie
  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: "Copié",
        description: "Le contenu a été copié dans le presse-papiers.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier le contenu.",
        variant: "destructive",
      });
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Non supporté',
        description: 'La géolocalisation n\'est pas supportée par votre navigateur.',
        variant: 'destructive',
      });
      return;
    }

    setGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        setFormData(prev => ({
          ...prev,
          latitude,
          longitude,
        }));

        // ✅ CORRECTION P1-6: Gérer correctement le résultat du geocoding
        let addressFound = false;

        // Essayer de récupérer l'adresse via geocoding inversé (Mapbox ou autre API)
        try {
          const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
          if (MAPBOX_TOKEN) {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}`
            );

            if (!response.ok) {
              throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();

            if (data.features && data.features.length > 0) {
              const address = data.features[0].place_name;
              setFormData(prev => ({
                ...prev,
                address,
              }));
              addressFound = true;
            }
          }
        } catch (error) {
          console.error('Erreur lors de la récupération de l\'adresse:', error);
        }

        setGettingLocation(false);

        // ✅ CORRECTION P1-6: Message différent selon le résultat du geocoding
        if (addressFound) {
          toast({
            title: 'Position obtenue',
            description: 'Votre position et adresse ont été récupérées avec succès.',
          });
        } else {
          toast({
            title: 'Position GPS obtenue',
            description: 'Coordonnées enregistrées. Veuillez saisir votre adresse manuellement.',
            variant: 'default',
          });
        }
      },
      (error) => {
        console.error('Erreur de géolocalisation:', error);
        setGettingLocation(false);
        
        toast({
          title: 'Erreur',
          description: 'Impossible d\'obtenir votre position. Veuillez vérifier les permissions.',
          variant: 'destructive',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleSave = async () => {
    if (!formData.address) {
      toast({
        title: 'Erreur',
        description: 'Veuillez entrer une adresse.',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.latitude || !formData.longitude) {
      toast({
        title: 'Erreur',
        description: 'Veuillez obtenir votre position GPS en cliquant sur "Obtenir ma position".',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      await api.patch('/practitioners/me', {
        address: formData.address,
        latitude: formData.latitude,
        longitude: formData.longitude,
      });

      toast({
        title: 'Localisation mise à jour',
        description: 'Votre localisation a été enregistrée avec succès.',
      });

      setIsEditing(false);
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de mettre à jour la localisation.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      address: practitionerData?.address || '',
      latitude: practitionerData?.latitude || null,
      longitude: practitionerData?.longitude || null,
    });
    setIsEditing(false);
  };

  // Skeleton loading
  if (!practitionerData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête global */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MapPinned className="h-6 w-6" />
            Zone d'intervention
            {isLocationConfigured ? (
              <Badge className="bg-green-500">Configurée</Badge>
            ) : (
              <Badge variant="destructive">Non configurée</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Définissez votre localisation et zone de couverture
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <MapPin className="h-4 w-4" />
              Adresse
            </div>
            <div className="flex items-center gap-2">
              {locationStats.hasAddress ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="font-medium">{locationStats.hasAddress ? 'Définie' : 'Non définie'}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Navigation className="h-4 w-4" />
              Coordonnées GPS
            </div>
            <div className="flex items-center gap-2">
              {locationStats.hasCoordinates ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="font-medium">{locationStats.hasCoordinates ? 'Définies' : 'Non définies'}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Radius className="h-4 w-4" />
              Rayon d'intervention
            </div>
            <p className="text-2xl font-bold">{locationStats.radius} km</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Building2 className="h-4 w-4" />
              Communes desservies
            </div>
            <p className="text-2xl font-bold">{locationStats.communesCount}</p>
          </CardContent>
        </Card>
      </div>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Localisation
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Votre localisation permet aux patients de vous trouver sur la carte et de calculer la distance.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>
          Définissez votre localisation de base pour les calculs de distance et l'affichage sur la carte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!practitionerData?.latitude && !isEditing && (
          <div className="text-center py-8">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Vous n'avez pas encore défini votre localisation</p>
            <p className="text-sm text-muted-foreground mt-1">
              Les patients ne pourront pas vous trouver sur la carte
            </p>
            <Button onClick={() => setIsEditing(true)} className="mt-4">
              <MapPin className="h-4 w-4 mr-2" />
              Définir ma localisation
            </Button>
          </div>
        )}

        {practitionerData?.latitude && !isEditing && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adresse actuelle</Label>
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {formData.address || 'Non définie'}
                  </p>
                  {formData.address && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(formData.address, 'address')}
                    >
                      {copiedField === 'address' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
                {formData.latitude && formData.longitude && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm text-muted-foreground cursor-help">
                            📍 {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Latitude: {formData.latitude}</p>
                          <p>Longitude: {formData.longitude}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(`${formData.latitude}, ${formData.longitude}`, 'coords')}
                    >
                      {copiedField === 'coords' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Button onClick={() => setIsEditing(true)} className="w-full">
              Modifier ma localisation
            </Button>
          </div>
        )}

        {isEditing && (
          <div className="space-y-4">
            <AddressSearchInput
              label="Adresse"
              value={formData.address}
              onChange={(location) => setFormData({
                address: location.address,
                latitude: location.latitude || null,
                longitude: location.longitude || null,
              })}
              placeholder="Rechercher votre adresse professionnelle..."
              required
            />
            
            <p className="text-sm text-muted-foreground">
              Votre adresse professionnelle ou de domicile
            </p>

            {formData.latitude && formData.longitude && (
              <div className="p-3 bg-success/10 border border-success/20 rounded-lg flex items-start gap-2">
                <Check className="h-4 w-4 text-success mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-success">Position GPS enregistrée</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Latitude: {formData.latitude.toFixed(6)}, Longitude: {formData.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={getCurrentLocation}
              disabled={gettingLocation || loading}
              variant="outline"
              className="w-full"
            >
              {gettingLocation ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Obtention de la position...
                </>
              ) : (
                <>
                  <Navigation className="mr-2 h-4 w-4" />
                  Obtenir ma position GPS actuelle
                </>
              )}
            </Button>

            <div className="flex gap-2">
              <Button
                onClick={handleCancel}
                variant="outline"
                disabled={loading}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading || !formData.latitude || !formData.longitude}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  'Enregistrer'
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
