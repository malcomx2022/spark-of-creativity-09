import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Navigation, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AddressSearchInput } from '@/components/AddressSearchInput';

interface LocationSectionProps {
  practitionerId: string;
  practitionerData: any;
}

export function LocationSection({ practitionerId, practitionerData }: LocationSectionProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

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

        // Essayer de récupérer l'adresse via geocoding inversé (Mapbox ou autre API)
        try {
          const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
          if (MAPBOX_TOKEN) {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}`
            );
            const data = await response.json();
            
            if (data.features && data.features.length > 0) {
              const address = data.features[0].place_name;
              setFormData(prev => ({
                ...prev,
                address,
              }));
            }
          }
        } catch (error) {
          console.error('Erreur lors de la récupération de l\'adresse:', error);
        }

        setGettingLocation(false);

        toast({
          title: 'Position obtenue',
          description: 'Votre position actuelle a été récupérée avec succès.',
        });
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
      const { error } = await supabase
        .from('practitioners')
        .update({
          address: formData.address,
          latitude: formData.latitude,
          longitude: formData.longitude,
          updated_at: new Date().toISOString(),
        })
        .eq('id', practitionerId);

      if (error) throw error;

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Localisation
        </CardTitle>
        <CardDescription>
          Définissez votre localisation de base pour les calculs de distance et l'affichage sur la carte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!practitionerData?.latitude && !isEditing && (
          <Alert>
            <AlertDescription>
              Vous n'avez pas encore défini votre localisation. Les patients ne pourront pas vous trouver sur la carte.
            </AlertDescription>
          </Alert>
        )}

        {!isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Adresse actuelle</Label>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  {formData.address || 'Non définie'}
                </p>
                {formData.latitude && formData.longitude && (
                  <p className="text-xs text-muted-foreground mt-1">
                    📍 {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                  </p>
                )}
              </div>
            </div>

            <Button onClick={() => setIsEditing(true)} className="w-full">
              {formData.address ? 'Modifier ma localisation' : 'Définir ma localisation'}
            </Button>
          </div>
        ) : (
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
  );
}
