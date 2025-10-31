/**
 * Calcule la distance entre deux points géographiques en utilisant la formule Haversine
 * @param lat1 Latitude du premier point
 * @param lon1 Longitude du premier point
 * @param lat2 Latitude du second point
 * @param lon2 Longitude du second point
 * @returns Distance en kilomètres (arrondi à 2 décimales)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Rayon de la Terre en kilomètres
  
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Number(distance.toFixed(2));
}

/**
 * Convertit des degrés en radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Formate une distance en kilomètres de manière lisible
 * @param km Distance en kilomètres
 * @returns Distance formatée (ex: "500 m", "2.5 km", "45 km")
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m`;
  }
  
  if (km >= 100) {
    return `${Math.round(km)} km`;
  }
  
  return `${km.toFixed(1)} km`;
}

export interface CoordinatesWithDistance<T> {
  item: T;
  distance: number;
}

/**
 * Filtre et trie les praticiens par distance depuis la position de l'utilisateur
 * @param userLat Latitude de l'utilisateur
 * @param userLon Longitude de l'utilisateur
 * @param practitioners Liste des praticiens avec coordonnées
 * @param maxDistance Distance maximale en kilomètres (par défaut 50 km)
 * @returns Liste des praticiens dans le rayon avec leur distance, triés par distance croissante
 */
export function getNearbyPractitioners<T extends { latitude: number; longitude: number }>(
  userLat: number,
  userLon: number,
  practitioners: T[],
  maxDistance: number = 50
): Array<T & { distance: number }> {
  const practitionersWithDistance = practitioners
    .map(practitioner => ({
      ...practitioner,
      distance: calculateDistance(
        userLat,
        userLon,
        practitioner.latitude,
        practitioner.longitude
      ),
    }))
    .filter(p => p.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
  
  return practitionersWithDistance;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface MapBounds {
  sw: { lng: number; lat: number };
  ne: { lng: number; lat: number };
}

/**
 * Calcule les bounds Mapbox pour afficher tous les points sur la carte
 * @param coordinates Liste des coordonnées à afficher
 * @param padding Padding optionnel en pixels (par défaut 50)
 * @returns Bounds au format Mapbox [[swLng, swLat], [neLng, neLat]]
 */
export function getBoundsForCoordinates(
  coordinates: Coordinates[],
  padding: number = 50
): [[number, number], [number, number]] | null {
  if (coordinates.length === 0) {
    return null;
  }
  
  if (coordinates.length === 1) {
    // Single point, return a small bounds around it
    const { lat, lng } = coordinates[0];
    const offset = 0.01; // ~1km
    return [
      [lng - offset, lat - offset],
      [lng + offset, lat + offset],
    ];
  }
  
  let minLat = coordinates[0].lat;
  let maxLat = coordinates[0].lat;
  let minLng = coordinates[0].lng;
  let maxLng = coordinates[0].lng;
  
  coordinates.forEach(coord => {
    minLat = Math.min(minLat, coord.lat);
    maxLat = Math.max(maxLat, coord.lat);
    minLng = Math.min(minLng, coord.lng);
    maxLng = Math.max(maxLng, coord.lng);
  });
  
  return [
    [minLng, minLat], // Southwest
    [maxLng, maxLat], // Northeast
  ];
}

/**
 * Vérifie si un point est dans un rayon donné depuis un centre
 * @param centerLat Latitude du centre
 * @param centerLon Longitude du centre
 * @param pointLat Latitude du point
 * @param pointLon Longitude du point
 * @param radiusKm Rayon en kilomètres
 * @returns true si le point est dans le rayon
 */
export function isWithinRadius(
  centerLat: number,
  centerLon: number,
  pointLat: number,
  pointLon: number,
  radiusKm: number
): boolean {
  const distance = calculateDistance(centerLat, centerLon, pointLat, pointLon);
  return distance <= radiusKm;
}

/**
 * Trouve le praticien le plus proche
 * @param userLat Latitude de l'utilisateur
 * @param userLon Longitude de l'utilisateur
 * @param practitioners Liste des praticiens
 * @returns Le praticien le plus proche avec sa distance, ou null si aucun
 */
export function findNearestPractitioner<T extends { latitude: number; longitude: number }>(
  userLat: number,
  userLon: number,
  practitioners: T[]
): (T & { distance: number }) | null {
  if (practitioners.length === 0) {
    return null;
  }
  
  const nearby = getNearbyPractitioners(userLat, userLon, practitioners);
  return nearby[0] || null;
}
