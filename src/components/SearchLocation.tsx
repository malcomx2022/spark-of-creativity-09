import { useState, useEffect, useCallback } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Search, MapPin, Building2, Home, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Location {
  lat: number;
  lng: number;
  address: string;
  placeType: string;
}

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  place_type: string[];
  text: string;
}

interface SearchLocationProps {
  onLocationSelect: (location: Location) => void;
  mapboxToken: string;
  placeholder?: string;
  defaultValue?: string;
}

const STORAGE_KEY = 'recent_location_searches';
const MAX_RECENT = 5;
const DEBOUNCE_DELAY = 300;

const PLACE_ICONS: Record<string, React.ReactNode> = {
  address: <Home className="h-4 w-4" />,
  place: <Building2 className="h-4 w-4" />,
  poi: <MapPin className="h-4 w-4" />,
  default: <MapPin className="h-4 w-4" />,
};

export function SearchLocation({
  onLocationSelect,
  mapboxToken,
  placeholder = 'Rechercher une adresse à Cotonou...',
  defaultValue = '',
}: SearchLocationProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(defaultValue);
  const [results, setResults] = useState<MapboxFeature[]>([]);
  const [recentSearches, setRecentSearches] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error loading recent searches:', err);
      }
    }
  }, []);

  // Save recent search
  const saveRecentSearch = useCallback((location: Location) => {
    try {
      const updated = [
        location,
        ...recentSearches.filter(s => s.address !== location.address),
      ].slice(0, MAX_RECENT);
      
      setRecentSearches(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error saving recent search:', err);
      }
    }
  }, [recentSearches]);

  // Debounced geocoding search
  useEffect(() => {
    if (!searchValue || searchValue.length < 3) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      await performSearch(searchValue);
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [searchValue, mapboxToken]);

  const performSearch = async (query: string, retryCount = 0) => {
    if (!mapboxToken || mapboxToken.trim().length === 0) {
      setError('Configuration Mapbox manquante. Veuillez contacter le support.');
      toast({
        variant: 'destructive',
        title: 'Erreur de configuration',
        description: 'Le service de recherche d\'adresse n\'est pas configuré. Contactez l\'administrateur.',
      });
      return;
    }

    // Vérifier que le token ressemble à un token Mapbox valide (commence par pk.)
    if (!mapboxToken.startsWith('pk.')) {
      setError('Token Mapbox invalide');
      toast({
        variant: 'destructive',
        title: 'Configuration invalide',
        description: 'Le token Mapbox est mal configuré.',
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?` +
        `access_token=${mapboxToken}&` +
        `country=BJ&` +
        `types=address,place,poi&` +
        `limit=5&` +
        `language=fr`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.status}`);
      }

      const data = await response.json();
      setResults(data.features || []);
    } catch (err) {
      console.error('Geocoding error:', err);
      
      // Retry logic avec délai exponentiel
      if (retryCount < 2) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Max 5 secondes

        if (import.meta.env.DEV) {
          console.log(`Retrying search... (${retryCount + 1}/2) in ${delay}ms`);
        }

        setTimeout(() => {
          performSearch(query, retryCount + 1);
        }, delay);
        return;
      }

      setError('Erreur lors de la recherche. Veuillez réessayer.');
      toast({
        variant: 'destructive',
        title: 'Erreur de recherche',
        description: 'Impossible de rechercher l\'adresse. Vérifiez votre connexion.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLocation = (feature: MapboxFeature) => {
    const location: Location = {
      lat: feature.center[1],
      lng: feature.center[0],
      address: feature.place_name,
      placeType: feature.place_type[0] || 'place',
    };

    saveRecentSearch(location);
    onLocationSelect(location);
    setSearchValue(feature.text);
    setOpen(false);
  };

  const handleSelectRecent = (location: Location) => {
    onLocationSelect(location);
    setSearchValue(location.address.split(',')[0]);
    setOpen(false);
  };

  const getPlaceIcon = (placeType: string) => {
    return PLACE_ICONS[placeType] || PLACE_ICONS.default;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-start text-left font-normal"
        >
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          {searchValue || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm text-muted-foreground">Recherche...</span>
              </div>
            )}

            {error && (
              <div className="p-4 text-sm text-destructive">{error}</div>
            )}

            {!loading && !error && results.length === 0 && searchValue.length >= 3 && (
              <CommandEmpty>Aucune adresse trouvée.</CommandEmpty>
            )}

            {!loading && !error && results.length === 0 && recentSearches.length > 0 && (
              <CommandGroup heading="Recherches récentes">
                {recentSearches.map((location, index) => (
                  <CommandItem
                    key={`recent-${index}`}
                    value={location.address}
                    onSelect={() => handleSelectRecent(location)}
                  >
                    {getPlaceIcon(location.placeType)}
                    <span className="ml-2 flex-1 truncate">{location.address}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!loading && !error && results.length > 0 && (
              <CommandGroup heading="Résultats">
                {results.map((feature) => (
                  <CommandItem
                    key={feature.id}
                    value={feature.place_name}
                    onSelect={() => handleSelectLocation(feature)}
                  >
                    {getPlaceIcon(feature.place_type[0])}
                    <div className="ml-2 flex-1">
                      <div className="font-medium">{feature.text}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {feature.place_name}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
