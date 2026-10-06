import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { MapPin, Navigation, Locate, Maximize, Star, Stethoscope, Dumbbell, Activity } from 'lucide-react';
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

// Availability colors
const AVAILABILITY_COLORS: Record<string, string> = {
  today: '#10b981', // green
  week: '#f59e0b', // orange
  none: '#6b7280', // gray
};

// Helper to get practitioner icon SVG
const getPractitionerIconSVG = (practitionerType: string | undefined): string => {
  const isCoach = practitionerType === 'coach_sportif';
  
  if (isCoach) {
    // Coach sportif icon (Dumbbell)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.4 14.4 9.6 9.6"/>
      <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/>
      <path d="m21.5 21.5-1.4-1.4"/>
      <path d="M3.9 3.9 2.5 2.5"/>
      <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>
    </svg>`;
  }
  
  // Praticien médical icon (Stethoscope)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M11 2v2"/>
    <path d="M5 2v2"/>
    <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/>
    <path d="M8 15a6 6 0 0 0 12 0v-3"/>
    <circle cx="20" cy="10" r="2"/>
  </svg>`;
};

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
        fadeDuration: 0, // Désactive les animations de fade pour un chargement plus rapide
        trackResize: true,
        renderWorldCopies: false, // Optimisation pour un seul rendu du monde
      });

      // Add controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
      
      // Track map load state - utiliser 'idle' au lieu de 'load' pour être plus rapide
      map.current.once('idle', () => {
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
      // Create custom user location marker with pulsing effect
      const userEl = document.createElement('div');
      userEl.className = 'user-location-marker';
      userEl.style.cssText = `
        width: 20px;
        height: 20px;
        background-color: #0EA5E9;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.7), 0 2px 8px rgba(0,0,0,0.3);
        animation: pulse 2s infinite;
        position: relative;
      `;
      
      // Add pulsing animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.7), 0 2px 8px rgba(0,0,0,0.3);
          }
          70% {
            box-shadow: 0 0 0 15px rgba(14, 165, 233, 0), 0 2px 8px rgba(0,0,0,0.3);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(14, 165, 233, 0), 0 2px 8px rgba(0,0,0,0.3);
          }
        }
      `;
      document.head.appendChild(style);
      
      const userMarker = new mapboxgl.Marker({ element: userEl })
        .setLngLat([currentUserLoc.longitude, currentUserLoc.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
          '<div class="p-3 font-semibold"><span class="text-lg">📍</span> Votre position</div>'
        ))
        .addTo(map.current);
      markersRef.current.push(userMarker);
    }

    // Add practitioner markers
    practitioners.forEach(practitioner => {
      // Determine availability
      const availability = practitioner.available ? 'today' : 'week';
      const color = AVAILABILITY_COLORS[availability];

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

      // Create custom marker element with icon based on type
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.style.cssText = `
        cursor: pointer;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, ${color} 0%, ${color}dd 100%);
        border-radius: 50%;
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.3);
        transition: box-shadow 0.2s, filter 0.2s;
        border: 2px solid white;
      `;
      el.innerHTML = getPractitionerIconSVG(practitioner.practitioner_type);
      
      // Utiliser filter au lieu de transform pour éviter le déplacement du marqueur
      el.addEventListener('mouseenter', () => {
        el.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4), 0 0 0 4px rgba(255,255,255,0.4)';
        el.style.filter = 'brightness(1.1)';
      });
      
      el.addEventListener('mouseleave', () => {
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.3)';
        el.style.filter = 'brightness(1)';
      });

      // Create popup content
      const rating = practitioner.rating || 0;
      const stars = '⭐'.repeat(Math.round(rating));
      const practitionerLabel = practitioner.practitioner_type === 'coach_sportif' 
        ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">🏋️ Coach Sportif</span>'
        : '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">⚕️ Praticien</span>';
      
      const popupContent = `
        <div class="p-3 min-w-[220px]">
          ${practitioner.image ? `<img src="${practitioner.image}" alt="${practitioner.name}" class="w-full h-24 object-cover rounded-lg mb-2"/>` : ''}
          <div class="mb-2">${practitionerLabel}</div>
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
    (window as Window & { selectPractitioner?: (id: string) => void }).selectPractitioner = (id: string) => {
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
    <div className="relative w-full h-full min-h-[500px]">
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

      <div ref={mapContainer} className="absolute inset-0 rounded-lg w-full h-full" />
      
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
