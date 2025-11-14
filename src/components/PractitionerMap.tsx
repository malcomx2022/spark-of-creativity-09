import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { MapPin, Navigation, Locate, Maximize, Star } from 'lucide-react';
import { SearchLocation } from './SearchLocation';
import { useGeolocation } from '@/hooks/useGeolocation';
import { calculateDistance, formatDistance } from '@/lib/geolocation';
import { toast } from '@/hooks/use-toast';

interface PractitionerMapProps {
  practitioners: PractitionerLocation[];
  userLocation: UserLocation | null;
  onPractitionerSelect?: (practitioner: PractitionerLocation) => void;
  mapboxToken: string;
}

// Specialty icons mapping
const SPECIALTY_ICONS: Record<string, string> = {
  'Médecin généraliste': '🩺',
  'Dentiste': '🦷',
  'Cardiologue': '❤️',
  'Pédiatre': '👶',
  'Dermatologue': '🧴',
  'Ophtalmologue': '👁️',
  'Gynécologue': '🤰',
  'default': '⚕️',
};

// Availability colors
const AVAILABILITY_COLORS: Record<string, string> = {
  today: '#10b981', // green
  week: '#f59e0b', // orange
  none: '#6b7280', // gray
};

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  
  const { position: geoPosition, requestPosition, loading: geoLoading } = useGeolocation();

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    try {
      mapboxgl.accessToken = mapboxToken;
      
      // Determine initial center: user location > geolocation > Cotonou, Benin
      const centerLat = userLocation?.latitude || geoPosition?.latitude || 6.3703;
      const centerLng = userLocation?.longitude || geoPosition?.longitude || 2.3912;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centerLng, centerLat],
        zoom: 12,
      });

      // Add controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
      
      // Track map load state
      map.current.on('load', () => {
        setIsMapLoaded(true);
      });

      // Handle offline mode
      map.current.on('error', (e) => {
        if (e.error?.message?.includes('Failed to fetch')) {
          toast({
            title: 'Mode hors ligne',
            description: 'Certaines fonctionnalités de la carte peuvent être limitées.',
          });
        }
      });

      return () => {
        markersRef.current.forEach(marker => marker.remove());
        map.current?.remove();
      };
    } catch (error) {
      console.error('Error initializing map:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur de carte',
        description: 'Impossible de charger la carte. Vérifiez votre connexion.',
      });
    }
  }, [mapboxToken]);

  // Update markers when practitioners or user location changes
  useEffect(() => {
    if (!map.current || !isMapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add user location marker
    const currentUserLoc = userLocation || 
      (geoPosition ? { latitude: geoPosition.latitude, longitude: geoPosition.longitude } : null);
    
    if (currentUserLoc) {
      const userMarker = new mapboxgl.Marker({ color: '#0EA5E9', scale: 1.2 })
        .setLngLat([currentUserLoc.longitude, currentUserLoc.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
          '<div class="p-2"><strong>Votre position</strong></div>'
        ))
        .addTo(map.current);
      markersRef.current.push(userMarker);
    }

    // Add practitioner markers
    practitioners.forEach(practitioner => {
      // Determine availability
      const availability = practitioner.available ? 'today' : 'week';
      const color = AVAILABILITY_COLORS[availability];
      const icon = SPECIALTY_ICONS[practitioner.specialty] || SPECIALTY_ICONS.default;

      // Calculate distance if user location available
      let distance: number | null = null;
      if (currentUserLoc) {
        distance = calculateDistance(
          currentUserLoc.latitude,
          currentUserLoc.longitude,
          practitioner.latitude,
          practitioner.longitude
        );
      }

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.style.cssText = `
        cursor: pointer;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: ${color};
        border-radius: 50%;
        color: white;
        font-size: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        transition: transform 0.2s;
      `;
      el.innerHTML = icon;
      
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.2)';
      });
      
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
      });

      // Create popup content
      const rating = practitioner.rating || 0;
      const stars = '⭐'.repeat(Math.round(rating));
      
      const popupContent = `
        <div class="p-3 min-w-[200px]">
          ${practitioner.image ? `<img src="${practitioner.image}" alt="${practitioner.name}" class="w-full h-24 object-cover rounded-lg mb-2"/>` : ''}
          <div class="font-semibold text-base">${practitioner.name}</div>
          <div class="text-sm text-gray-600">${practitioner.specialty}</div>
          <div class="flex items-center gap-1 mt-1">
            <span class="text-xs">${stars}</span>
            <span class="text-xs text-gray-500">(${rating.toFixed(1)})</span>
          </div>
          ${distance ? `<div class="text-xs text-gray-500 mt-1">📍 ${formatDistance(distance)}</div>` : ''}
          <button 
            class="mt-2 w-full bg-primary text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            onclick="window.selectPractitioner('${practitioner.id}')"
          >
            Voir le profil
          </button>
        </div>
      `;

      const popup = new mapboxgl.Popup({ 
        offset: 25,
        className: 'practitioner-popup'
      }).setHTML(popupContent);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([practitioner.longitude, practitioner.latitude])
        .setPopup(popup)
        .addTo(map.current!);

      el.addEventListener('click', () => {
        setSelectedPractitioner(practitioner);
      });

      markersRef.current.push(marker);
    });

    // Setup global handler for practitioner selection from popup
    (window as any).selectPractitioner = (id: string) => {
      const practitioner = practitioners.find(p => p.id === id);
      if (practitioner) {
        setSelectedPractitioner(practitioner);
        if (onPractitionerSelect) {
          onPractitionerSelect(practitioner);
        }
      }
    };

    // Implement clustering if more than 50 practitioners
    if (practitioners.length > 50 && map.current.getSource('practitioners') === undefined) {
      // Add clustering layer
      map.current.addSource('practitioners', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: practitioners.map(p => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [p.longitude, p.latitude]
            },
            properties: {
              id: p.id,
              name: p.name,
            }
          }))
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'practitioners',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6', 20,
            '#f1f075', 50,
            '#f28cb1'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20, 20,
            30, 50,
            40
          ]
        }
      });

      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'practitioners',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        }
      });
    }

  }, [practitioners, userLocation, geoPosition, onPractitionerSelect, isMapLoaded]);

  const handleMyLocation = () => {
    if (!map.current) return;

    if (geoPosition) {
      map.current.flyTo({
        center: [geoPosition.longitude, geoPosition.latitude],
        zoom: 14,
        duration: 1000
      });
    } else {
      requestPosition();
      toast({
        title: 'Localisation',
        description: 'Demande de permission pour accéder à votre position...',
      });
    }
  };

  const handleLocationSelect = (location: { lat: number; lng: number; address: string }) => {
    if (!map.current) return;

    map.current.flyTo({
      center: [location.lng, location.lat],
      zoom: 14,
      duration: 1000
    });

    // Add temporary marker
    const tempMarker = new mapboxgl.Marker({ color: '#ef4444', scale: 1.1 })
      .setLngLat([location.lng, location.lat])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div class="p-2"><strong>${location.address}</strong></div>`
      ))
      .addTo(map.current);
    
    setTimeout(() => tempMarker.remove(), 5000);
  };

  const toggleFullscreen = () => {
    if (!mapContainer.current) return;

    if (!document.fullscreenElement) {
      mapContainer.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Search bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex gap-2">
        <div className="flex-1 max-w-md">
          <SearchLocation
            onLocationSelect={handleLocationSelect}
            mapboxToken={mapboxToken}
            placeholder="Rechercher une adresse à Cotonou..."
          />
        </div>
        
        <Button
          variant="secondary"
          size="icon"
          onClick={handleMyLocation}
          disabled={geoLoading}
          title="Ma position"
        >
          <Locate className={`h-4 w-4 ${geoLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div ref={mapContainer} className="absolute inset-0 rounded-lg" />
      
      {selectedPractitioner && (
        <Card className="absolute bottom-4 left-4 right-4 p-4 shadow-lg z-10 max-w-md mx-auto">
          <div className="flex items-start gap-4">
            {selectedPractitioner.image && (
              <img 
                src={selectedPractitioner.image} 
                alt={selectedPractitioner.name}
                className="w-16 h-16 rounded-full object-cover"
              />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{selectedPractitioner.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedPractitioner.specialty}</p>
              
              {selectedPractitioner.rating && (
                <div className="flex items-center gap-1 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 ${
                        i < Math.round(selectedPractitioner.rating || 0)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({selectedPractitioner.rating?.toFixed(1)})
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-2 mt-2 text-sm">
                <MapPin className="h-4 w-4" />
                <span className="line-clamp-1">{selectedPractitioner.address}</span>
              </div>
              
              {selectedPractitioner.distance && (
                <p className="text-sm mt-1 text-primary font-medium">
                  📍 {formatDistance(selectedPractitioner.distance)}
                </p>
              )}
            </div>
            <Button onClick={() => setSelectedPractitioner(null)} variant="ghost" size="sm">
              ✕
            </Button>
          </div>
          <div className="flex gap-2 mt-4">
            <Button className="flex-1" onClick={() => onPractitionerSelect?.(selectedPractitioner)}>
              Voir le profil
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
              title="Itinéraire"
            >
              <Navigation className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
