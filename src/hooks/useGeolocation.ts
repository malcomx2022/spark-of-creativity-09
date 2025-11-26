import { useState, useEffect, useCallback } from 'react';

interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  watchPosition?: boolean;
}

interface UseGeolocationReturn {
  position: UserPosition | null;
  error: string | null;
  loading: boolean;
  requestPosition: () => void;
}

const STORAGE_KEY = 'last_geolocation_position';

const ERROR_MESSAGES = {
  PERMISSION_DENIED: '🚫 Permission GPS refusée. Pour utiliser la recherche automatique, vous devez autoriser l\'accès à votre localisation dans les paramètres de votre navigateur. Sinon, passez en mode manuel pour saisir votre adresse.',
  POSITION_UNAVAILABLE: '📡 Position GPS indisponible. Vérifiez que le GPS de votre appareil est activé et que vous êtes dans une zone avec une bonne réception satellite. Si le problème persiste, utilisez le mode manuel.',
  TIMEOUT: '⏱️ Délai de localisation dépassé (>10 secondes). Le GPS prend trop de temps à répondre. Essayez de vous rapprocher d\'une fenêtre ou d\'un lieu ouvert, puis cliquez sur "Réessayer". Vous pouvez aussi utiliser le mode manuel.',
  UNKNOWN: '❓ Erreur inconnue de géolocalisation. Veuillez vérifier que votre appareil et navigateur supportent la géolocalisation, puis réessayez. En cas d\'échec, utilisez le mode manuel.',
  NOT_SUPPORTED: '❌ Votre navigateur ne supporte pas la géolocalisation. Veuillez passer en mode manuel pour saisir votre adresse ou utilisez un navigateur plus récent (Chrome, Firefox, Safari, Edge).',
};

export function useGeolocation(options: UseGeolocationOptions = {}): UseGeolocationReturn {
  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 300000, // 5 minutes
    watchPosition = false,
  } = options;

  const [position, setPosition] = useState<UserPosition | null>(() => {
    // Load last known position from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if position is not too old (less than 1 hour)
        if (Date.now() - parsed.timestamp < 3600000) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Error loading stored position:', error);
    }
    return null;
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const savePosition = useCallback((pos: UserPosition) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch (error) {
      console.error('Error saving position:', error);
    }
  }, []);

  const handleSuccess = useCallback((geoPosition: GeolocationPosition) => {
    const newPosition: UserPosition = {
      latitude: geoPosition.coords.latitude,
      longitude: geoPosition.coords.longitude,
      accuracy: Math.round(geoPosition.coords.accuracy),
      timestamp: Date.now(),
    };

    setPosition(newPosition);
    setError(null);
    setLoading(false);
    savePosition(newPosition);
  }, [savePosition]);

  const handleError = useCallback((err: GeolocationPositionError) => {
    let errorMessage: string;

    switch (err.code) {
      case err.PERMISSION_DENIED:
        errorMessage = ERROR_MESSAGES.PERMISSION_DENIED;
        break;
      case err.POSITION_UNAVAILABLE:
        errorMessage = ERROR_MESSAGES.POSITION_UNAVAILABLE;
        break;
      case err.TIMEOUT:
        errorMessage = ERROR_MESSAGES.TIMEOUT;
        break;
      default:
        errorMessage = ERROR_MESSAGES.UNKNOWN;
    }

    setError(errorMessage);
    setLoading(false);
    console.error('Geolocation error:', err);
  }, []);

  const requestPosition = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError(ERROR_MESSAGES.NOT_SUPPORTED);
      return;
    }

    setLoading(true);
    setError(null);

    const geoOptions: PositionOptions = {
      enableHighAccuracy,
      timeout,
      maximumAge,
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      geoOptions
    );
  }, [enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  // Auto-request position on mount if watchPosition is enabled
  useEffect(() => {
    if (!watchPosition) return;

    if (!('geolocation' in navigator)) {
      setError(ERROR_MESSAGES.NOT_SUPPORTED);
      return;
    }

    setLoading(true);

    const geoOptions: PositionOptions = {
      enableHighAccuracy,
      timeout,
      maximumAge,
    };

    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      geoOptions
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [watchPosition, enableHighAccuracy, timeout, maximumAge, handleSuccess, handleError]);

  return {
    position,
    error,
    loading,
    requestPosition,
  };
}
