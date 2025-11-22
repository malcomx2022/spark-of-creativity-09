import { useState, useEffect, useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, Building2, Home, Loader2, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export interface LocationData {
  address: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  place_type: string[];
  context?: Array<{ id: string; text: string }>;
}

interface AddressSearchInputProps {
  label?: string;
  value: string;
  onChange: (location: LocationData) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

const STORAGE_KEY = 'recent_addresses_v2';
const MAX_RECENT = 5;
const DEBOUNCE_DELAY = 400;

const PLACE_ICONS: Record<string, React.ReactNode> = {
  address: <Home className="h-4 w-4 text-primary" />,
  place: <Building2 className="h-4 w-4 text-primary" />,
  poi: <MapPin className="h-4 w-4 text-primary" />,
  default: <MapPin className="h-4 w-4 text-primary" />,
};

export function AddressSearchInput({
  label = 'Adresse',
  value,
  onChange,
  placeholder = 'Rechercher une adresse au Bénin...',
  required = false,
  className = '',
}: AddressSearchInputProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(value);
  const [results, setResults] = useState<MapboxFeature[]>([]);
  const [recentSearches, setRecentSearches] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Charger les recherches récentes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Error loading recent addresses:', err);
    }
  }, []);

  // Synchroniser avec la valeur externe
  useEffect(() => {
    if (value !== searchValue) {
      setSearchValue(value);
    }
  }, [value]);

  // Sauvegarder une recherche récente
  const saveRecentSearch = useCallback((location: LocationData) => {
    try {
      const updated = [
        location,
        ...recentSearches.filter(s => s.address !== location.address),
      ].slice(0, MAX_RECENT);
      
      setRecentSearches(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Error saving recent address:', err);
    }
  }, [recentSearches]);

  // Récupérer le token Mapbox une seule fois
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        
        if (error || !data?.token) {
          setTokenError(true);
          toast({
            variant: 'destructive',
            title: 'Configuration manquante',
            description: 'Token Mapbox non configuré.',
          });
          return;
        }
        
        setMapboxToken(data.token);
      } catch (err) {
        console.error('Error fetching Mapbox token:', err);
        setTokenError(true);
      }
    };
    
    fetchToken();
  }, []);

  // Recherche Mapbox avec debounce
  const performSearch = async (query: string) => {
    if (!query || query.length < 3) {
      setResults([]);
      return;
    }

    if (!mapboxToken) {
      if (tokenError) {
        toast({
          variant: 'destructive',
          title: 'Configuration manquante',
          description: 'Token Mapbox non configuré.',
        });
      }
      return;
    }

    setLoading(true);

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?` +
        `access_token=${mapboxToken}&` +
        `country=BJ&` +
        `types=address,place,poi,locality&` +
        `limit=5&` +
        `language=fr`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Mapbox API error: ${response.status}`);
      }

      const data = await response.json();
      setResults(data.features || []);
    } catch (err) {
      console.error('Geocoding error:', err);
      toast({
        variant: 'destructive',
        title: 'Erreur de recherche',
        description: 'Impossible de rechercher l\'adresse. Réessayez.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Debounce de la recherche
  useEffect(() => {
    if (!mapboxToken) return;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(searchValue);
    }, DEBOUNCE_DELAY);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchValue, mapboxToken]);

  const handleSelectLocation = (feature: MapboxFeature) => {
    // Extraire la ville depuis le contexte
    const cityContext = feature.context?.find(c => c.id.startsWith('place.'));
    const city = cityContext?.text || '';

    const location: LocationData = {
      address: feature.place_name,
      city: city,
      latitude: feature.center[1],
      longitude: feature.center[0],
    };

    saveRecentSearch(location);
    onChange(location);
    setSearchValue(feature.place_name);
    setOpen(false);
  };

  const handleSelectRecent = (location: LocationData) => {
    onChange(location);
    setSearchValue(location.address);
    setOpen(false);
  };

  const getPlaceIcon = (placeType: string) => {
    return PLACE_ICONS[placeType] || PLACE_ICONS.default;
  };

  return (
    <div className={className}>
      {label && (
        <Label className="mb-2 block">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              placeholder={placeholder}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={() => setOpen(true)}
              required={required}
              className="pr-10"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandList>
              {loading && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">Recherche en cours...</span>
                </div>
              )}

              {!loading && results.length === 0 && searchValue.length >= 3 && (
                <CommandEmpty>Aucune adresse trouvée. Continuez à taper.</CommandEmpty>
              )}

              {!loading && results.length === 0 && searchValue.length < 3 && recentSearches.length > 0 && (
                <CommandGroup heading="Recherches récentes">
                  {recentSearches.map((location, index) => (
                    <CommandItem
                      key={`recent-${index}`}
                      value={location.address}
                      onSelect={() => handleSelectRecent(location)}
                      className="cursor-pointer"
                    >
                      <Clock className="h-4 w-4 text-muted-foreground mr-2" />
                      <span className="flex-1 truncate">{location.address}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {!loading && results.length > 0 && (
                <CommandGroup heading="Adresses suggérées">
                  {results.map((feature) => (
                    <CommandItem
                      key={feature.id}
                      value={feature.place_name}
                      onSelect={() => handleSelectLocation(feature)}
                      className="cursor-pointer"
                    >
                      {getPlaceIcon(feature.place_type[0])}
                      <div className="ml-2 flex-1 overflow-hidden">
                        <div className="font-medium truncate">{feature.text}</div>
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
      {searchValue.length > 0 && searchValue.length < 3 && (
        <p className="text-xs text-muted-foreground mt-1">
          Tapez au moins 3 caractères pour rechercher
        </p>
      )}
    </div>
  );
}
