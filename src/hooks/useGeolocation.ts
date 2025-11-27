import { useState, useEffect, useCallback, useRef } from 'react';

interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

interface GeolocationQuality {
  level: 'excellent' | 'good' | 'fair' | 'poor';
  message: string;
  color: string;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  watchPosition?: boolean;
  maxAcceptableAccuracy?: number; // Maximum accuracy in meters (lower is better)
  minAcceptableAccuracy?: number; // Minimum accuracy threshold in meters
  retryAttempts?: number; // Number of retry attempts for better accuracy
}

interface UseGeolocationReturn {
  position: UserPosition | null;
  error: string | null;
  loading: boolean;
  requestPosition: () => void;
  quality: GeolocationQuality | null;
  isRefining: boolean; // Indicates if position is being refined
}

const STORAGE_KEY = 'last_geolocation_position';
const MAX_CACHE_AGE = 180000; // 3 minutes (cache plus court pour plus de précision)

const ERROR_MESSAGES = {
  PERMISSION_DENIED: '🚫 Permission GPS refusée. Pour utiliser la recherche automatique, vous devez autoriser l\'accès à votre localisation dans les paramètres de votre navigateur. Sinon, passez en mode manuel pour saisir votre adresse.',
  POSITION_UNAVAILABLE: '📡 Position GPS indisponible. Vérifiez que le GPS de votre appareil est activé et que vous êtes dans une zone avec une bonne réception satellite. Si le problème persiste, utilisez le mode manuel.',
  TIMEOUT: '⏱️ Délai de localisation dépassé. Le GPS prend trop de temps à répondre. Essayez de vous rapprocher d\'une fenêtre ou d\'un lieu ouvert, puis cliquez sur "Réessayer". Vous pouvez aussi utiliser le mode manuel.',
  UNKNOWN: '❓ Erreur inconnue de géolocalisation. Veuillez vérifier que votre appareil et navigateur supportent la géolocalisation, puis réessayez. En cas d\'échec, utilisez le mode manuel.',
  NOT_SUPPORTED: '❌ Votre navigateur ne supporte pas la géolocalisation. Veuillez passer en mode manuel pour saisir votre adresse ou utilisez un navigateur plus récent (Chrome, Firefox, Safari, Edge).',
  LOW_ACCURACY: '⚠️ La précision GPS est insuffisante. Essayez de vous déplacer vers un lieu plus dégagé (pas de bâtiments hauts, pas en intérieur) pour améliorer la précision.',
};

/**
 * Évalue la qualité de la géolocalisation selon la précision
 */
function evaluateGeolocationQuality(accuracy: number): GeolocationQuality {
  if (accuracy <= 20) {
    return {
      level: 'excellent',
      message: 'Excellente précision GPS (±' + Math.round(accuracy) + 'm)',
      color: 'text-green-600',
    };
  } else if (accuracy <= 50) {
    return {
      level: 'good',
      message: 'Bonne précision GPS (±' + Math.round(accuracy) + 'm)',
      color: 'text-blue-600',
    };
  } else if (accuracy <= 100) {
    return {
      level: 'fair',
      message: 'Précision acceptable (±' + Math.round(accuracy) + 'm)',
      color: 'text-yellow-600',
    };
  } else {
    return {
      level: 'poor',
      message: 'Précision faible (±' + Math.round(accuracy) + 'm)',
      color: 'text-orange-600',
    };
  }
}

export function useGeolocation(options: UseGeolocationOptions = {}): UseGeolocationReturn {
  const {
    enableHighAccuracy = true,
    timeout = 15000, // 15 seconds for high accuracy
    maximumAge = 0, // Always get fresh position for maximum accuracy
    watchPosition = false,
    maxAcceptableAccuracy = 50, // Accept positions up to 50m accuracy
    minAcceptableAccuracy = 20, // Try to get at least 20m accuracy
    retryAttempts = 3, // Retry up to 3 times for better accuracy
  } = options;

  const [position, setPosition] = useState<UserPosition | null>(() => {
    // Load last known position from localStorage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if position is recent (less than 3 minutes) and accurate enough
        const isRecent = Date.now() - parsed.timestamp < MAX_CACHE_AGE;
        const isAccurate = parsed.accuracy <= maxAcceptableAccuracy;
        if (isRecent && isAccurate) {
          console.log('✅ Using cached position:', parsed);
          return parsed;
        } else {
          console.log('⚠️ Cached position expired or inaccurate, will request fresh position');
        }
      }
    } catch (error) {
      console.error('Error loading stored position:', error);
    }
    return null;
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quality, setQuality] = useState<GeolocationQuality | null>(() => {
    // Evaluate quality of cached position if available
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.timestamp < MAX_CACHE_AGE) {
          return evaluateGeolocationQuality(parsed.accuracy);
        }
      } catch (error) {
        console.error('Error evaluating cached position quality:', error);
      }
    }
    return null;
  });
  const [isRefining, setIsRefining] = useState(false);
  
  // Use refs for values that need to persist across callback invocations
  const attemptCountRef = useRef(0);
  const bestPositionRef = useRef<UserPosition | null>(null);

  const savePosition = useCallback((pos: UserPosition) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch (error) {
      console.error('Error saving position:', error);
    }
  }, []);

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
    setIsRefining(false);
    attemptCountRef.current = 0;
    bestPositionRef.current = null;
    console.error('Geolocation error:', err);
  }, []);

  const handleSuccess = useCallback((geoPosition: GeolocationPosition) => {
    const currentAttempt = attemptCountRef.current;
    
    const newPosition: UserPosition = {
      latitude: geoPosition.coords.latitude,
      longitude: geoPosition.coords.longitude,
      accuracy: Math.round(geoPosition.coords.accuracy),
      timestamp: Date.now(),
      altitude: geoPosition.coords.altitude,
      altitudeAccuracy: geoPosition.coords.altitudeAccuracy,
      heading: geoPosition.coords.heading,
      speed: geoPosition.coords.speed,
    };

    console.log(`📍 Position obtenue (tentative ${currentAttempt}/${retryAttempts}):`, {
      accuracy: newPosition.accuracy + 'm',
      coords: `${newPosition.latitude.toFixed(6)}, ${newPosition.longitude.toFixed(6)}`,
    });

    // Check if this position is better than the previous best
    const isBetterPosition = !bestPositionRef.current || newPosition.accuracy < bestPositionRef.current.accuracy;
    
    if (isBetterPosition) {
      bestPositionRef.current = newPosition;
    }

    const positionToUse = bestPositionRef.current!;
    const newQuality = evaluateGeolocationQuality(positionToUse.accuracy);
    
    // If accuracy is excellent or we've reached max attempts, accept position
    if (positionToUse.accuracy <= minAcceptableAccuracy || currentAttempt >= retryAttempts) {
      console.log('✅ Position finale acceptée:', {
        accuracy: positionToUse.accuracy + 'm',
        quality: newQuality.level,
        attempts: currentAttempt,
      });
      
      setPosition(positionToUse);
      setQuality(newQuality);
      setError(null);
      setLoading(false);
      setIsRefining(false);
      attemptCountRef.current = 0;
      bestPositionRef.current = null;
      savePosition(positionToUse);
    } 
    // If accuracy is acceptable but not excellent, and we have attempts left, try again
    else if (positionToUse.accuracy <= maxAcceptableAccuracy && currentAttempt < retryAttempts) {
      console.log(`🔄 Position acceptable mais affinage possible (tentative ${currentAttempt + 1}/${retryAttempts})...`);
      setIsRefining(true);
      attemptCountRef.current = currentAttempt + 1;
      
      // Request another position after a short delay
      setTimeout(() => {
        const geoOptions: PositionOptions = {
          enableHighAccuracy: true,
          timeout: timeout,
          maximumAge: 0, // Force fresh position
        };
        
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (err) => {
            // If retry fails, use the best position we have
            if (bestPositionRef.current) {
              console.log('⚠️ Échec affinement, utilisation meilleure position disponible');
              setPosition(bestPositionRef.current);
              setQuality(evaluateGeolocationQuality(bestPositionRef.current.accuracy));
              savePosition(bestPositionRef.current);
            } else {
              handleError(err);
            }
            setIsRefining(false);
            attemptCountRef.current = 0;
            bestPositionRef.current = null;
            setLoading(false);
          },
          geoOptions
        );
      }, 1000); // Wait 1 second between attempts
    }
    // Position is not accurate enough and we're out of attempts
    else if (positionToUse.accuracy > maxAcceptableAccuracy) {
      console.warn('⚠️ Précision insuffisante après toutes les tentatives:', positionToUse.accuracy + 'm');
      setPosition(positionToUse);
      setQuality(newQuality);
      setError(ERROR_MESSAGES.LOW_ACCURACY);
      setLoading(false);
      setIsRefining(false);
      attemptCountRef.current = 0;
      bestPositionRef.current = null;
      savePosition(positionToUse);
    }
  }, [savePosition, minAcceptableAccuracy, maxAcceptableAccuracy, retryAttempts, timeout, handleError]);

  const requestPosition = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError(ERROR_MESSAGES.NOT_SUPPORTED);
      return;
    }

    console.log('🎯 Démarrage géolocalisation haute précision...');
    setLoading(true);
    setError(null);
    attemptCountRef.current = 1;
    bestPositionRef.current = null;

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true, // Force high accuracy
      timeout,
      maximumAge: 0, // Force fresh position
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      geoOptions
    );
  }, [timeout, handleSuccess, handleError]);

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
    quality,
    isRefining,
  };
}
