import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { MapPin, Navigation } from 'lucide-react';

interface PractitionerMapProps {
  practitioners: PractitionerLocation[];
  userLocation: UserLocation | null;
  onPractitionerSelect?: (practitioner: PractitionerLocation) => void;
  mapboxToken: string;
}

export default function PractitionerMap({ 
  practitioners, 
  userLocation, 
  onPractitionerSelect,
  mapboxToken 
}: PractitionerMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [selectedPractitioner, setSelectedPractitioner] = useState<PractitionerLocation | null>(null);

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;
    
    const centerLat = userLocation?.latitude || 48.8566;
    const centerLng = userLocation?.longitude || 2.3522;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [centerLng, centerLat],
      zoom: 12,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'top-right'
    );

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      map.current?.remove();
    };
  }, [mapboxToken, userLocation]);

  useEffect(() => {
    if (!map.current) return;

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (userLocation) {
      const userMarker = new mapboxgl.Marker({ color: '#0EA5E9' })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Votre position</strong>'))
        .addTo(map.current);
      markersRef.current.push(userMarker);
    }

    practitioners.forEach(practitioner => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      el.innerHTML = `
        <div class="bg-primary text-primary-foreground rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
      `;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([practitioner.longitude, practitioner.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2">
              <strong>${practitioner.name}</strong><br/>
              <span class="text-sm">${practitioner.specialty}</span><br/>
              <span class="text-xs text-muted-foreground">${practitioner.distance ? `${practitioner.distance.toFixed(1)} km` : ''}</span>
            </div>
          `)
        )
        .addTo(map.current!);

      el.addEventListener('click', () => {
        setSelectedPractitioner(practitioner);
        if (onPractitionerSelect) {
          onPractitionerSelect(practitioner);
        }
      });

      markersRef.current.push(marker);
    });
  }, [practitioners, userLocation, onPractitionerSelect]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 rounded-lg" />
      
      {selectedPractitioner && (
        <Card className="absolute bottom-4 left-4 right-4 p-4 shadow-lg z-10">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{selectedPractitioner.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedPractitioner.specialty}</p>
              <div className="flex items-center gap-2 mt-2 text-sm">
                <MapPin className="h-4 w-4" />
                <span>{selectedPractitioner.address}</span>
              </div>
              {selectedPractitioner.distance && (
                <p className="text-sm mt-1">Distance: {selectedPractitioner.distance.toFixed(1)} km</p>
              )}
            </div>
            <Button onClick={() => setSelectedPractitioner(null)} variant="ghost" size="sm">
              ✕
            </Button>
          </div>
          <div className="flex gap-2 mt-4">
            <Button className="flex-1" onClick={() => onPractitionerSelect?.(selectedPractitioner)}>
              Prendre rendez-vous
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => {
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${selectedPractitioner.latitude},${selectedPractitioner.longitude}`,
                  '_blank'
                );
              }}
            >
              <Navigation className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
