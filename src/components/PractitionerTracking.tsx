import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, MessageSquare, Navigation, Clock, CheckCircle2 } from 'lucide-react';
import { api, onTableChange, subscribeAppointment } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const ENV_MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface PublicConfig {
  mapboxToken: string | null;
  features: Record<string, boolean>;
}

/** Colonnes de suivi de `GET /appointments/:id`. */
interface TrackedAppointment {
  practitioner_status?: string | null;
  practitioner_latitude?: number | null;
  practitioner_longitude?: number | null;
}

interface PractitionerTrackingProps {
  appointmentId: string;
  practitionerName: string;
  practitionerImage?: string;
  patientAddress: string;
  patientLat?: number;
  patientLng?: number;
  onOpenMessaging?: () => void;
}

type TrackingStatus = 'assigned' | 'preparing' | 'en_route' | 'arrived' | 'in_progress';

const STATUS_LABELS: Record<TrackingStatus, string> = {
  assigned: 'Assigné',
  preparing: 'Se prépare',
  en_route: 'En route',
  arrived: 'Arrivé',
  in_progress: 'Consultation en cours',
};

const STATUS_COLORS: Record<TrackingStatus, string> = {
  assigned: 'bg-gray-500',
  preparing: 'bg-blue-500',
  en_route: 'bg-amber-500',
  arrived: 'bg-green-500',
  in_progress: 'bg-primary',
};

const isTrackingStatus = (value: unknown): value is TrackingStatus => typeof value === 'string' && value in STATUS_LABELS;

export function PractitionerTracking({
  appointmentId,
  practitionerName,
  practitionerImage,
  patientAddress,
  patientLat,
  patientLng,
  onOpenMessaging,
}: PractitionerTrackingProps) {
  const [status, setStatus] = useState<TrackingStatus>('assigned');
  const [practitionerLocation, setPractitionerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [eta] = useState<string | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [mapContainer, setMapContainer] = useState<HTMLDivElement | null>(null);

  // Jeton Mapbox : variable d'environnement en priorité, sinon configuration publique de l'API
  const { data: publicConfig } = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api.get<PublicConfig>('/config/public', { auth: false }),
    enabled: !ENV_MAPBOX_TOKEN,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const mapboxToken = ENV_MAPBOX_TOKEN || publicConfig?.mapboxToken || null;

  // Relire le rendez-vous (statut et position du praticien)
  const refreshTracking = useCallback(async () => {
    try {
      const appointment = await api.get<TrackedAppointment>(`/appointments/${appointmentId}`);
      if (isTrackingStatus(appointment.practitioner_status)) {
        setStatus(appointment.practitioner_status);
      }
      if (appointment.practitioner_latitude && appointment.practitioner_longitude) {
        setPractitionerLocation({
          lat: Number(appointment.practitioner_latitude),
          lng: Number(appointment.practitioner_longitude),
        });
      }
    } catch (error) {
      console.error('Erreur chargement du suivi du praticien:', error);
    }
  }, [appointmentId]);

  // Écouter les mises à jour en temps réel (room du rendez-vous, puis relecture)
  useEffect(() => {
    refreshTracking();

    const unsubscribeRoom = subscribeAppointment(appointmentId);
    const offChanges = onTableChange('appointments', (event) => {
      if (event.id === appointmentId || event.appointment_id === appointmentId) {
        refreshTracking();
      }
    });

    return () => {
      offChanges();
      unsubscribeRoom();
    };
  }, [appointmentId, refreshTracking]);

  // Initialiser la carte
  useEffect(() => {
    if (!mapContainer || !mapboxToken || !patientLat || !patientLng) return;

    mapboxgl.accessToken = mapboxToken;

    const newMap = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [patientLng, patientLat],
      zoom: 13,
    });

    // Ajouter marqueur patient
    new mapboxgl.Marker({ color: '#4F46E5' })
      .setLngLat([patientLng, patientLat])
      .setPopup(new mapboxgl.Popup().setHTML(`<strong>Votre adresse</strong><p>${patientAddress}</p>`))
      .addTo(newMap);

    setMap(newMap);

    return () => {
      newMap.remove();
    };
  }, [mapContainer, mapboxToken, patientLat, patientLng, patientAddress]);

  // Mettre à jour la position du praticien sur la carte
  useEffect(() => {
    if (!map || !practitionerLocation) return;

    // Supprimer l'ancien marqueur s'il existe
    const existingMarker = document.querySelector('.practitioner-marker');
    if (existingMarker) existingMarker.remove();

    // Ajouter nouveau marqueur praticien
    const el = document.createElement('div');
    el.className = 'practitioner-marker';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#10b981';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

    new mapboxgl.Marker(el)
      .setLngLat([practitionerLocation.lng, practitionerLocation.lat])
      .setPopup(new mapboxgl.Popup().setHTML(`<strong>${practitionerName}</strong><p>${STATUS_LABELS[status]}</p>`))
      .addTo(map);

    // Ajuster la carte pour montrer les deux marqueurs
    if (patientLat && patientLng) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([patientLng, patientLat]);
      bounds.extend([practitionerLocation.lng, practitionerLocation.lat]);
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [map, practitionerLocation, practitionerName, status, patientLat, patientLng]);

  const initials = practitionerName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Suivi du praticien</CardTitle>
            <Badge className={STATUS_COLORS[status]}>
              {STATUS_LABELS[status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={practitionerImage} alt={practitionerName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">{practitionerName}</p>
              <Button
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={onOpenMessaging}
              >
                <MessageSquare className="mr-1 h-3 w-3" />
                Envoyer un message
              </Button>
            </div>
          </div>

          {status === 'en_route' && eta && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Arrivée estimée dans <strong>{eta}</strong>
              </AlertDescription>
            </Alert>
          )}

          {status === 'arrived' && (
            <Alert className="border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Le praticien est arrivé à votre adresse
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="text-muted-foreground">{patientAddress}</span>
          </div>
        </CardContent>
      </Card>

      {/* Carte */}
      {patientLat && patientLng && (
        <Card>
          <CardContent className="p-0">
            <div
              ref={setMapContainer}
              className="h-[400px] w-full rounded-lg"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
