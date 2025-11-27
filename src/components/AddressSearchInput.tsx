import { useState, useEffect, useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, Building2, Home, Loader2, Clock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  error?: string;
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
  error,
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
          console.error('❌ Token Mapbox non configuré:', error);
          toast({
            variant: 'destructive',
            title: '⚙️ Configuration manquante',
            description: 'Le service de recherche d\'adresse n\'est pas configuré. Veuillez contacter l\'administrateur pour activer le token Mapbox.',
            duration: 7000,
          });
          return;
        }
        
        setMapboxToken(data.token);
        console.log('✅ Token Mapbox chargé avec succès');
      } catch (err) {
        console.error('❌ Erreur lors du chargement du token Mapbox:', err);
        setTokenError(true);
        toast({
          variant: 'destructive',
          title: '❌ Erreur de configuration',
          description: 'Impossible de charger la configuration de recherche d\'adresse. Vérifiez votre connexion internet.',
          duration: 5000,
        });
      }
    };
    
    fetchToken();
  }, []);

  // Recherche Mapbox avec debounce
  const performSearch = async (query: string) => {
    // Validation de la longueur minimale
    if (!query || query.trim().length === 0) {
      setResults([]);
      return;
    }

    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    // Vérifier que le token est disponible
    if (!mapboxToken) {
      if (tokenError) {
        console.warn('⚠️ Tentative de recherche sans token Mapbox configuré');
      }
      return;
    }

    setLoading(true);
    console.log(`🔍 Recherche Mapbox pour: "${query}"`);

    try {
      const encodedQuery = encodeURIComponent(query.trim());
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?` +
        `access_token=${mapboxToken}&` +
        `country=BJ&` +
        `types=address,place,poi,locality&` +
        `limit=5&` +
        `language=fr`;

      // Timeout pour la requête réseau
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 secondes

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erreur API Mapbox:', response.status, errorText);
        
        if (response.status === 401) {
          throw new Error('🔑 Token Mapbox invalide. Veuillez contacter l\'administrateur.');
        } else if (response.status === 429) {
          throw new Error('⏱️ Trop de requêtes. Veuillez patienter quelques secondes et réessayer.');
        } else if (response.status >= 500) {
          throw new Error('🌐 Le service Mapbox est temporairement indisponible. Réessayez dans quelques instants.');
        } else {
          throw new Error(`Erreur API Mapbox (${response.status}). Veuillez réessayer.`);
        }
      }

      const data = await response.json();
      const features = data.features || [];
      
      console.log(`✅ ${features.length} résultat(s) trouvé(s)`);
      setResults(features);
      
    } catch (err) {
      console.error('❌ Erreur lors de la recherche d\'adresse:', err);
      
      let errorTitle = '🔍 Erreur de recherche';
      let errorDescription = 'Impossible de rechercher l\'adresse. Veuillez réessayer.';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorTitle = '⏱️ Timeout de recherche';
          errorDescription = 'La recherche a pris trop de temps. Vérifiez votre connexion internet et réessayez.';
        } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          errorTitle = '📡 Erreur réseau';
          errorDescription = 'Impossible de contacter le service de recherche. Vérifiez votre connexion internet et réessayez.';
        } else if (err.message.startsWith('🔑') || err.message.startsWith('⏱️') || err.message.startsWith('🌐')) {
          // Messages déjà formatés depuis les codes d'erreur HTTP
          errorDescription = err.message;
        }
      }
      
      toast({
        variant: 'destructive',
        title: errorTitle,
        description: errorDescription,
        duration: 5000,
      });
      
      setResults([]);
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
              className={cn(
                'pr-10',
                error && 'border-destructive focus-visible:ring-destructive'
              )}
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
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
      {searchValue.length > 0 && searchValue.length < 3 && (
        <p className="text-xs text-muted-foreground mt-1">
          Tapez au moins 3 caractères pour rechercher
        </p>
      )}
    </div>
  );
}
