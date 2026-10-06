import React, { lazy, Suspense, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin } from 'lucide-react';
import type { PractitionerLocation, UserLocation } from '@/types/practitioner';

// Précharger le CSS Mapbox immédiatement
if (typeof document !== 'undefined') {
  const existingLink = document.querySelector('link[href*="mapbox-gl.css"]');
  if (!existingLink) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
    document.head.appendChild(link);
  }
}

const PractitionerMap = lazy(() => import('./PractitionerMap'));

interface LazyPractitionerMapProps {
  practitioners: PractitionerLocation[];
  userLocation: UserLocation | null;
  onPractitionerSelect?: (practitioner: PractitionerLocation) => void;
  mapboxToken: string;
}

function MapLoadingFallback() {
  return (
    <div className="w-full h-full min-h-[500px] bg-muted rounded-lg flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Chargement de la carte...</p>
      </div>
    </div>
  );
}

function MapErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert className="h-full min-h-[500px] flex flex-col items-center justify-center">
      <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
      <AlertDescription className="text-center space-y-4">
        <p className="text-lg font-semibold">Carte indisponible</p>
        <p className="text-muted-foreground">
          La carte n'a pas pu être chargée. Vérifiez votre connexion internet.
        </p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Réessayer
        </button>
      </AlertDescription>
    </Alert>
  );
}

export default function LazyPractitionerMap({
  practitioners,
  userLocation,
  onPractitionerSelect,
  mapboxToken,
}: LazyPractitionerMapProps) {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = () => {
    setHasError(false);
    setRetryKey(prev => prev + 1);
  };

  if (hasError) {
    return <MapErrorFallback onRetry={handleRetry} />;
  }

  // Afficher le fallback de chargement si le token n'est pas encore disponible
  if (!mapboxToken) {
    return <MapLoadingFallback />;
  }

  return (
    <Suspense fallback={<MapLoadingFallback />}>
      <ErrorBoundary
        onError={() => setHasError(true)}
        key={retryKey}
      >
        <PractitionerMap
          practitioners={practitioners}
          userLocation={userLocation}
          onPractitionerSelect={onPractitionerSelect}
          mapboxToken={mapboxToken}
        />
      </ErrorBoundary>
    </Suspense>
  );
}

// Simple Error Boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Map Error Boundary caught:', error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
