import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { MapPin, Navigation, Clock, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Appointment } from '@/types/appointment';

interface GPSTrackingProps {
  appointment: Appointment;
}

export default function GPSTracking({ appointment }: GPSTrackingProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [userPosition, setUserPosition] = useState<GeolocationPosition | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);

  const startTracking = () => {
    if ('geolocation' in navigator) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          setUserPosition(position);
          setIsTracking(true);
          
          // Simuler le calcul du temps estimé (en minutes)
          const randomTime = Math.floor(Math.random() * 20) + 5;
          setEstimatedTime(randomTime);
        },
        (error) => {
          console.error('Erreur de suivi GPS:', error);
          toast({
            title: 'Erreur de suivi',
            description: 'Impossible de suivre votre position.',
            variant: 'destructive'
          });
          setIsTracking(false);
        },
        { 
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
      
      setWatchId(id);
      
      toast({
        title: 'Suivi activé',
        description: 'Votre position est maintenant suivie en temps réel.'
      });
    } else {
      toast({
        title: 'Non supporté',
        description: 'Le suivi GPS n\'est pas supporté par votre navigateur.',
        variant: 'destructive'
      });
    }
  };

  const stopTracking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setIsTracking(false);
      toast({
        title: 'Suivi arrêté',
        description: 'Le suivi GPS a été désactivé.'
      });
    }
  };

  const openNavigation = () => {
    const encodedAddress = encodeURIComponent(appointment.address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
  };

  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-5 w-5" />
          Suivi GPS du rendez-vous
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-sm">Destination</p>
              <p className="text-sm text-muted-foreground">{appointment.address}</p>
            </div>
          </div>
          
          {isTracking && estimatedTime && (
            <div className="flex items-start gap-2 pt-2 border-t">
              <Clock className="h-4 w-4 mt-0.5 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-sm">Temps estimé</p>
                <p className="text-sm text-muted-foreground">{estimatedTime} minutes</p>
              </div>
            </div>
          )}
          
          {isTracking && userPosition && (
            <div className="flex items-start gap-2 pt-2 border-t">
              <MapPin className="h-4 w-4 mt-0.5 text-green-600" />
              <div className="flex-1">
                <p className="font-medium text-sm">Position actuelle</p>
                <p className="text-xs text-muted-foreground">
                  Lat: {userPosition.coords.latitude.toFixed(6)}, 
                  Lng: {userPosition.coords.longitude.toFixed(6)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Précision: ±{Math.round(userPosition.coords.accuracy)}m
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-muted/50 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Le suivi GPS vous permet de naviguer jusqu'à votre rendez-vous et d'être guidé en temps réel.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {!isTracking ? (
            <Button onClick={startTracking} className="flex-1">
              <Navigation className="mr-2 h-4 w-4" />
              Démarrer le suivi
            </Button>
          ) : (
            <Button onClick={stopTracking} variant="destructive" className="flex-1">
              Arrêter le suivi
            </Button>
          )}
          
          <Button onClick={openNavigation} variant="outline">
            <Navigation className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Rendez-vous le {new Date(appointment.date).toLocaleDateString('fr-FR')} à {appointment.time}
        </div>
      </CardContent>
    </Card>
  );
}
