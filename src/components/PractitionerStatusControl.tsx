import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Navigation, 
  MapPin, 
  Play, 
  CheckCircle2, 
  Clock,
  AlertCircle 
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { PractitionerTrackingStatus } from '@/types/appointment';

interface PractitionerStatusControlProps {
  appointmentId: string;
  currentStatus: PractitionerTrackingStatus;
  patientName: string;
  patientAddress: string;
  appointmentTime: string;
  onStatusChange?: (newStatus: PractitionerTrackingStatus) => void;
}

const STATUS_CONFIG: Record<PractitionerTrackingStatus, {
  label: string;
  color: string;
  icon: React.ReactNode;
  nextStatus?: PractitionerTrackingStatus;
  nextLabel?: string;
}> = {
  assigned: {
    label: 'Assigné',
    color: 'bg-gray-500',
    icon: <Clock className="h-4 w-4" />,
    nextStatus: 'preparing',
    nextLabel: 'Je me prépare',
  },
  preparing: {
    label: 'En préparation',
    color: 'bg-blue-500',
    icon: <Clock className="h-4 w-4" />,
    nextStatus: 'en_route',
    nextLabel: 'Je suis en route',
  },
  en_route: {
    label: 'En route',
    color: 'bg-amber-500',
    icon: <Navigation className="h-4 w-4" />,
    nextStatus: 'arrived',
    nextLabel: 'Je suis arrivé',
  },
  arrived: {
    label: 'Arrivé',
    color: 'bg-green-500',
    icon: <MapPin className="h-4 w-4" />,
    nextStatus: 'in_progress',
    nextLabel: 'Démarrer la consultation',
  },
  in_progress: {
    label: 'Consultation en cours',
    color: 'bg-primary',
    icon: <Play className="h-4 w-4" />,
  },
};

export function PractitionerStatusControl({
  appointmentId,
  currentStatus,
  patientName,
  patientAddress,
  appointmentTime,
  onStatusChange,
}: PractitionerStatusControlProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [geoLocation, setGeoLocation] = useState<GeolocationPosition | null>(null);

  const config = STATUS_CONFIG[currentStatus];

  const updateStatus = async (newStatus: PractitionerTrackingStatus) => {
    setIsUpdating(true);

    try {
      // Obtenir la position GPS si en route ou arrivé
      let locationUpdate: {
        practitioner_latitude?: number;
        practitioner_longitude?: number;
        practitioner_last_location_update?: string;
      } = {};

      if (newStatus === 'en_route' || newStatus === 'arrived') {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
            });
          });

          setGeoLocation(position);
          locationUpdate = {
            practitioner_latitude: position.coords.latitude,
            practitioner_longitude: position.coords.longitude,
            practitioner_last_location_update: new Date().toISOString(),
          };
        } catch (geoError) {
          console.warn('Impossible d\'obtenir la position GPS:', geoError);
          toast({
            title: 'GPS non disponible',
            description: 'La position ne sera pas partagée avec le patient.',
            variant: 'destructive',
          });
        }
      }

      // Mettre à jour le statut dans la base
      const { error } = await supabase
        .from('appointments')
        .update({
          practitioner_status: newStatus,
          ...locationUpdate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Mettre à jour le statut de l'appointment si démarrage consultation
      if (newStatus === 'in_progress') {
        await supabase
          .from('appointments')
          .update({
            status: 'in-progress',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointmentId);
      }

      toast({
        title: '✅ Statut mis à jour',
        description: `Vous êtes maintenant "${STATUS_CONFIG[newStatus].label}"`,
      });

      onStatusChange?.(newStatus);
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le statut.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Activer le tracking GPS continu quand en route
  const startGPSTracking = async () => {
    if (!('geolocation' in navigator)) {
      toast({
        title: 'GPS non disponible',
        description: 'Votre appareil ne supporte pas la géolocalisation.',
        variant: 'destructive',
      });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        // Mettre à jour la position dans la base toutes les 30 secondes
        await supabase
          .from('appointments')
          .update({
            practitioner_latitude: position.coords.latitude,
            practitioner_longitude: position.coords.longitude,
            practitioner_last_location_update: new Date().toISOString(),
          })
          .eq('id', appointmentId);
      },
      (error) => {
        console.error('Erreur tracking GPS:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000, // 30 secondes
        timeout: 27000,
      }
    );

    // Nettoyer le tracking quand le composant est démonté ou status change
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  };

  // Démarrer le tracking GPS quand en route
  if (currentStatus === 'en_route') {
    startGPSTracking();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Suivi de visite</CardTitle>
            <CardDescription>
              Patient : {patientName} • {appointmentTime}
            </CardDescription>
          </div>
          <Badge className={`${config.color} text-white`}>
            <span className="flex items-center gap-1">
              {config.icon}
              {config.label}
            </span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{patientAddress}</span>
        </div>

        {currentStatus === 'en_route' && (
          <Alert>
            <Navigation className="h-4 w-4" />
            <AlertDescription>
              Votre position est partagée en temps réel avec le patient
            </AlertDescription>
          </Alert>
        )}

        {currentStatus === 'arrived' && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Vous êtes arrivé. Le patient en est informé.
            </AlertDescription>
          </Alert>
        )}

        {currentStatus === 'in_progress' && (
          <Alert className="border-primary bg-primary/5">
            <Play className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              Consultation en cours. Pensez à remplir le compte-rendu à la fin.
            </AlertDescription>
          </Alert>
        )}

        {config.nextStatus && (
          <Button
            onClick={() => updateStatus(config.nextStatus!)}
            disabled={isUpdating}
            className="w-full"
            size="lg"
          >
            {isUpdating ? (
              <>
                <Clock className="mr-2 h-5 w-5 animate-spin" />
                Mise à jour...
              </>
            ) : (
              <>
                {STATUS_CONFIG[config.nextStatus].icon}
                <span className="ml-2">{config.nextLabel}</span>
              </>
            )}
          </Button>
        )}

        {currentStatus === 'in_progress' && (
          <Alert variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Une fois la consultation terminée, remplissez le compte-rendu
              dans l'onglet "Comptes-rendus"
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
