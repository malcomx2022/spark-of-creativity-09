import { useState, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Loader2, MapPin, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { CreateAppointmentData } from '@/types/appointment';
import { toast } from '@/hooks/use-toast';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { AddressSearchInput } from './AddressSearchInput';
import { api, errorMessage, isApiError } from '@/lib/api';
import type { PublicPractitionerRow } from '@/hooks/usePractitioners';
import { useQuery } from '@tanstack/react-query';
import { getCategoryLabel } from '@/lib/practitioner-categories';
import { usePractitionerAvailability, usePractitionerExceptions, PractitionerAvailability, PractitionerException } from '@/hooks/useAvailability';

/** Réponse de `GET /practitioners/available` (ex Edge Function find-available-practitioner). */
interface AvailablePractitionerRow extends PublicPractitionerRow {
  distanceKm: number;
  isAvailableAt: boolean;
  hasException: boolean;
}

interface AvailablePractitionersResponse {
  found: boolean;
  practitioner?: AvailablePractitionerRow | null;
  practitioners: AvailablePractitionerRow[];
  message?: string;
}

// Composant DatePopover séparé pour gérer l'état ouvert/fermé
interface DatePopoverProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  preselectedPractitioner?: PreselectedPractitioner;
  practitionerAvailability: PractitionerAvailability[];
  practitionerExceptions: PractitionerException[];
}

function DatePopover({ value, onChange, preselectedPractitioner, practitionerAvailability, practitionerExceptions }: DatePopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full pl-3 text-left font-normal',
            !value && 'text-muted-foreground border-muted-foreground/30'
          )}
        >
          {value ? (
            format(value, 'PPP', { locale: fr })
          ) : (
            <span>Sélectionnez une date...</span>
          )}
          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 text-sm text-muted-foreground border-b bg-muted/30">
          {preselectedPractitioner 
            ? `📅 Jours disponibles selon l'agenda de ${preselectedPractitioner.name}`
            : '📅 Sélectionnez une date (les dimanches dépendent des disponibilités des praticiens)'
          }
        </div>
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false); // Fermer le popover après sélection
          }}
          disabled={(date) => {
            // Comparer uniquement les dates (sans l'heure)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const compareDate = new Date(date);
            compareDate.setHours(0, 0, 0, 0);
            
            // Désactiver les dates passées
            if (compareDate < today) return true;
            
            // Si praticien pré-sélectionné, vérifier ses disponibilités
            if (preselectedPractitioner && practitionerAvailability.length > 0) {
              const dayOfWeek = date.getDay();
              const dateString = format(date, 'yyyy-MM-dd');
              
              // Vérifier les exceptions
              const exception = practitionerExceptions.find(e => e.date === dateString);
              if (exception && !exception.is_available) return true;
              
              // Vérifier s'il y a des créneaux pour ce jour
              const hasSlots = practitionerAvailability.some(
                a => a.day_of_week === dayOfWeek && a.is_active !== false
              );
              if (!hasSlots) return true;
            }
            
            return false;
          }}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

// Système de queue de toasts pour éviter l'affichage simultané
const toastQueue: Array<{ id: string; toast: any }> = [];
let isShowingToast = false;

const showToast = (toastConfig: any) => {
  const id = Math.random().toString(36);
  toastQueue.push({ id, toast: toastConfig });

  if (!isShowingToast) {
    processToastQueue();
  }
};

const processToastQueue = () => {
  if (toastQueue.length === 0) {
    isShowingToast = false;
    return;
  }

  isShowingToast = true;
  const { toast: toastConfig } = toastQueue.shift()!;

  toast(toastConfig);

  setTimeout(() => {
    processToastQueue();
  }, toastConfig.duration || 4000);
};

const formSchema = z.object({
  specialty: z.string().min(1, '❌ Vous devez sélectionner une catégorie de praticien'),
  date: z.date({ 
    message: '❌ Vous devez sélectionner une date pour le rendez-vous'
  }),
  time: z.string().min(1, '❌ Vous devez choisir un créneau horaire'),
  reason: z.string()
    .min(10, '❌ La raison doit contenir au moins 10 caractères pour permettre au praticien de mieux comprendre votre besoin')
    .max(500, '❌ La raison ne peut pas dépasser 500 caractères. Veuillez être plus concis'),
  urgencyLevel: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface PreselectedPractitioner {
  id: string;
  name: string;
  specialty: string;
}

interface NewAppointmentDialogProps {
  onSubmit: (data: CreateAppointmentData) => Promise<any>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preselectedPractitioner?: PreselectedPractitioner;
}

export function NewAppointmentDialog({ onSubmit, open: externalOpen, onOpenChange, preselectedPractitioner }: NewAppointmentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const handleOpenChange = onOpenChange || setInternalOpen;
  const [isSearchingPractitioner, setIsSearchingPractitioner] = useState(false);
  const [locationMode, setLocationMode] = useState<'auto' | 'manual'>('auto');
  const [manualLocation, setManualLocation] = useState<{ address: string; latitude: number | null; longitude: number | null }>({
    address: '',
    latitude: null,
    longitude: null
  });
  
  // Protection renforcée contre double soumission
  const isSubmittingRef = useRef(false);
  const submissionTimestampRef = useRef<number>(0);

  const { position, requestPosition, loading: geoLoading, error: geoError, quality, isRefining } = useGeolocation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      specialty: preselectedPractitioner?.specialty || '',
      time: '',
      reason: '',
      urgencyLevel: 'non-urgent'
    }
  });
  
  // Obtenir l'état de soumission de React Hook Form
  const isFormSubmitting = form.formState.isSubmitting;
  
  // Demander la localisation dès l'ouverture du dialogue
  const handleDialogOpenChange = (newOpen: boolean) => {
    handleOpenChange(newOpen);

    if (!newOpen) {
      setLocationMode('auto');
      setManualLocation({ address: '', latitude: null, longitude: null });
      // Reset protection double soumission
      isSubmittingRef.current = false;
      submissionTimestampRef.current = 0;
      form.reset({
        specialty: preselectedPractitioner?.specialty || '',
        date: undefined,
        time: '',
        reason: '',
        urgencyLevel: 'non-urgent'
      });
      return;
    }

    if (locationMode === 'auto' && !position && !geoLoading) {
      requestPosition();
      showToast({
        title: 'Localisation requise',
        description: 'Nous avons besoin de votre localisation pour trouver un praticien près de vous.',
        duration: 4000,
      });
    }
  };

  const handleSubmit = async (data: FormValues) => {
    // PROTECTION RENFORCÉE contre double soumission
    const now = Date.now();
    const MIN_DELAY_BETWEEN_SUBMISSIONS = 2000; // 2 secondes minimum entre soumissions
    
    // Vérifier si une soumission est déjà en cours
    if (isSubmittingRef.current) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Soumission déjà en cours (via ref), requête bloquée');
      }
      showToast({
        title: '⏳ Traitement en cours',
        description: 'Votre demande est déjà en cours de traitement. Veuillez patienter.',
        duration: 3000,
      });
      return;
    }
    
    // Vérifier si une soumission récente a eu lieu (protection temporelle)
    if (now - submissionTimestampRef.current < MIN_DELAY_BETWEEN_SUBMISSIONS) {
      const remainingMs = MIN_DELAY_BETWEEN_SUBMISSIONS - (now - submissionTimestampRef.current);
      if (import.meta.env.DEV) {
        console.warn(`⚠️ Soumission trop rapide, veuillez patienter ${Math.ceil(remainingMs / 1000)}s`);
      }
      showToast({
        title: '⚠️ Veuillez patienter',
        description: `Merci d'attendre ${Math.ceil(remainingMs / 1000)} seconde(s) avant de soumettre à nouveau.`,
        variant: 'destructive',
        duration: 2000,
      });
      return;
    }

    // Marquer comme en cours de soumission
    isSubmittingRef.current = true;
    submissionTimestampRef.current = now;
    if (import.meta.env.DEV) {
      console.log('🔒 Soumission verrouillée');
    }
    
    // Protection additionnelle
    if (isSearchingPractitioner) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Recherche de praticien déjà en cours');
      }
      isSubmittingRef.current = false;
      return;
    }

    // Si un praticien est pré-sélectionné (ex: coach choisi), créer directement le RDV
    // sans vérification GPS car le praticien viendra à l'adresse du patient
    if (preselectedPractitioner) {
      setIsSearchingPractitioner(true);
      
      try {
        if (import.meta.env.DEV) {
          console.log('📌 Praticien pré-sélectionné:', preselectedPractitioner);
        }

        // ✅ CORRECTION #3: Vérifier que le praticien est disponible et validé KYC
        // (GET /practitioners/:id ne renvoie que les praticiens validés ; l'API refuse aussi la
        // création si le praticien n'accepte plus de missions)
        let practitionerCheck: Pick<PublicPractitionerRow, 'id' | 'available'>;
        try {
          practitionerCheck = await api.get<PublicPractitionerRow>(`/practitioners/${preselectedPractitioner.id}`);
        } catch (error) {
          if (isApiError(error, 404)) {
            throw new Error('Ce praticien n\'est pas encore validé pour exercer');
          }
          throw new Error(errorMessage(error, 'Praticien introuvable'));
        }

        if (!practitionerCheck.available) {
          throw new Error('Ce praticien n\'est pas disponible actuellement');
        }

        const appointmentPayload = {
          specialty: preselectedPractitioner.specialty,
          date: data.date.toISOString(),
          time: data.time,
          reason: data.reason,
          urgencyLevel: data.urgencyLevel,
          practitionerId: preselectedPractitioner.id,
          practitionerName: preselectedPractitioner.name,
        };

        if (import.meta.env.DEV) {
          console.log('🔵 Création du rendez-vous avec praticien pré-sélectionné...');
        }
        const createdAppointment = await onSubmit(appointmentPayload);

        if (!createdAppointment?.id) {
          throw new Error('💾 Erreur lors de la création du rendez-vous.');
        }

        if (import.meta.env.DEV) {
          console.log('✅ Rendez-vous créé avec ID:', createdAppointment.id);
        }

        showToast({
          title: '✅ Demande envoyée',
          description: `Votre demande a été envoyée à ${preselectedPractitioner.name}. Vous serez notifié dès qu'il aura accepté.`,
          duration: 6000,
        });

        handleOpenChange(false);
        setIsSearchingPractitioner(false);
        isSubmittingRef.current = false;
        form.reset({
          specialty: preselectedPractitioner.specialty,
          date: undefined,
          time: '',
          reason: '',
          urgencyLevel: 'non-urgent'
        });
        return;
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('❌ Erreur création rendez-vous (praticien pré-sélectionné):', error);
        }
        setIsSearchingPractitioner(false);
        isSubmittingRef.current = false;
        
        showToast({
          title: '❌ Échec de création',
          description: error instanceof Error ? error.message : 'Impossible de créer le rendez-vous.',
          variant: 'destructive',
          duration: 6000,
        });
        return;
      }
    }

    // Bloquer la soumission pendant le chargement GPS
    if (locationMode === 'auto' && geoLoading) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Géolocalisation en cours');
      }
      isSubmittingRef.current = false;
      showToast({
        title: '📍 Géolocalisation en cours',
        description: 'Veuillez patienter pendant que nous déterminons votre position.',
        variant: 'destructive',
        duration: 4000,
      });
      return;
    }

    if (import.meta.env.DEV) {
      console.log('🔵 Formulaire soumis avec les données:', data);
    }


    // Vérification de la géolocalisation en mode automatique AVANT tout traitement
    if (locationMode === 'auto' && !position) {
      isSubmittingRef.current = false;
      showToast({
        title: '📍 Localisation requise',
        description: geoError 
          ? `${geoError}\n\nVous pouvez soit réessayer la géolocalisation, soit passer en mode manuel pour saisir votre adresse.`
          : 'Nous avons besoin de votre position pour rechercher un praticien près de vous. Veuillez autoriser la géolocalisation ou passer en mode manuel.',
        variant: 'destructive',
        duration: 7000,
      });
      
      if (!geoLoading && !geoError) {
        requestPosition();
      }
      return;
    }

    // Validation de la précision de la géolocalisation
    if (locationMode === 'auto' && position) {
      const MAX_ACCURACY_METERS = 1000; // 1 km de précision max
      
      if (position.accuracy > MAX_ACCURACY_METERS) {
        isSubmittingRef.current = false;
        showToast({
          title: '📍 Géolocalisation imprécise',
          description: `Votre position n'est pas assez précise (±${Math.round(position.accuracy)}m). Rapprochez-vous d'une fenêtre ou d'un lieu ouvert, puis réessayez. Vous pouvez aussi passer en mode manuel.`,
          variant: 'destructive',
          duration: 7000,
        });
        return;
      }

      // Vérifier si le cache de position est obsolète (> 5 minutes)
      const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
      const positionAge = Date.now() - position.timestamp;
      
      if (positionAge > CACHE_MAX_AGE_MS) {
        if (import.meta.env.DEV) {
          console.warn('⚠️ Position en cache obsolète, rafraîchissement automatique');
        }
        
        // Rafraîchir automatiquement la position
        requestPosition();

        showToast({
          title: '🔄 Rafraîchissement de la position',
          description: 'Votre position GPS est obsolète. Rafraîchissement automatique en cours...',
          duration: 5000,
        });

        isSubmittingRef.current = false;
        return;
      }

      if (import.meta.env.DEV) {
        console.log(`✅ Position valide - Précision: ${Math.round(position.accuracy)}m, Age: ${Math.round(positionAge / 1000)}s`);
      }
    }


    if (locationMode === 'manual') {
      // Validation de l'adresse manuelle
      if (!manualLocation.address.trim()) {
        isSubmittingRef.current = false;
        showToast({
          title: '❌ Adresse requise',
          description: 'Vous devez indiquer une adresse complète pour l\'intervention. Utilisez la recherche d\'adresse pour trouver votre localisation.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      if (manualLocation.address.trim().length < 10) {
        isSubmittingRef.current = false;
        showToast({
          title: '❌ Adresse incomplète',
          description: 'L\'adresse semble trop courte. Veuillez fournir une adresse complète (rue, quartier, ville).',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      if (!manualLocation.latitude || !manualLocation.longitude) {
        isSubmittingRef.current = false;
        showToast({
          title: '📍 Coordonnées GPS requises',
          description: 'Veuillez sélectionner une adresse dans la liste de suggestion pour obtenir les coordonnées GPS nécessaires à la recherche de praticien.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      setIsSearchingPractitioner(true);

      try {
        const appointmentPayload = {
          specialty: data.specialty,
          date: data.date.toISOString(),
          time: data.time,
          reason: data.reason,
          urgencyLevel: data.urgencyLevel,
          addressOverride: manualLocation.address,
          patientLat: manualLocation.latitude,
          patientLon: manualLocation.longitude,
        };

        if (import.meta.env.DEV) {
          console.log('📤 Envoi de la demande avec adresse manuelle...');
        }
        const createdAppointment = await onSubmit(appointmentPayload);

        // Validation stricte du retour
        if (!createdAppointment) {
          throw new Error('💾 Le serveur n\'a retourné aucune donnée. La création du rendez-vous a échoué.');
        }

        if (typeof createdAppointment !== 'object') {
          throw new Error(`💾 Type de retour invalide: le serveur a retourné un ${typeof createdAppointment} au lieu d'un objet.`);
        }

        if (!('id' in createdAppointment) || !createdAppointment.id) {
          if (import.meta.env.DEV) {
            console.error('❌ Réponse invalide:', createdAppointment);
          }
          throw new Error('💾 L\'ID du rendez-vous n\'a pas été retourné par le serveur. Le rendez-vous n\'a peut-être pas été créé correctement.');
        }

        if (import.meta.env.DEV) {
          console.log('✅ Rendez-vous créé avec ID:', createdAppointment.id);
        }

        showToast({
          title: '✅ Demande enregistrée avec succès',
          description: 'Votre demande a été envoyée. Notre équipe vous contactera sous 30 minutes pour affecter un praticien disponible et confirmer votre rendez-vous.',
          duration: 6000,
        });
        
        handleOpenChange(false);
        setIsSearchingPractitioner(false);
        isSubmittingRef.current = false;
        setLocationMode('auto');
        setManualLocation({ address: '', latitude: null, longitude: null });
        form.reset({
          specialty: '',
          date: undefined,
          time: '',
          reason: '',
          urgencyLevel: 'non-urgent'
        });
        
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('❌ Erreur création rendez-vous (mode manuel):', error);
        }
        setIsSearchingPractitioner(false);
        isSubmittingRef.current = false;
        
        let errorTitle = '❌ Échec de création';
        let errorDescription = 'Impossible de créer le rendez-vous. Veuillez réessayer.';
        
        if (error instanceof Error) {
          errorDescription = error.message;
          
          if (error.message.includes('💾')) {
            errorTitle = '💾 Erreur de sauvegarde';
          } else if (error.message.includes('timeout') || error.message.includes('⏱️')) {
            errorTitle = '⏱️ Délai dépassé';
          } else if (error.message.includes('network') || error.message.includes('📡')) {
            errorTitle = '📡 Erreur réseau';
          }
        }
        
        showToast({
          title: errorTitle,
          description: errorDescription,
          variant: 'destructive',
          duration: 6000,
        });
      }
      return;
    }

    setIsSearchingPractitioner(true);
    
    try {
      // 1. Rechercher un praticien disponible
      if (import.meta.env.DEV) {
        console.log('🔍 Recherche d\'un praticien disponible...');
      }
      
      // Formater la date en YYYY-MM-DD en utilisant le fuseau horaire local
      const year = data.date.getFullYear();
      const month = String(data.date.getMonth() + 1).padStart(2, '0');
      const day = String(data.date.getDate()).padStart(2, '0');
      const appointmentDate = `${year}-${month}-${day}`;
      
      if (import.meta.env.DEV) {
        console.log('📅 Date formatée pour la recherche:', appointmentDate);
        console.log('📍 Position:', { lat: position.latitude, lon: position.longitude });
        console.log('🔎 Paramètres:', { specialty: data.specialty, date: appointmentDate, time: data.time });
      }
      
      // Appeler l'API (ex Edge Function find-available-practitioner) avec 3 tentatives
      const findAvailable = () =>
        api.get<AvailablePractitionersResponse>('/practitioners/available', {
          query: {
            type: data.specialty,
            latitude: position.latitude,
            longitude: position.longitude,
            date: appointmentDate,
            time: data.time,
            radiusKm: 100,
            limit: 1,
          },
        });

      let availableData: AvailablePractitionersResponse | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3 && !availableData; attempt++) {
        try {
          availableData = await findAvailable();
        } catch (error) {
          lastError = error;
          // Les erreurs de validation (4xx) ne sont pas réessayées
          if (isApiError(error) && error.status >= 400 && error.status < 500) break;
          if (import.meta.env.DEV) {
            console.warn(`⚠️ Tentative ${attempt} échouée:`, errorMessage(error));
          }
          if (attempt === 1) {
            showToast({
              title: '🔄 Recherche en cours...',
              description: 'Première tentative échouée, nouvelle tentative en cours.',
              duration: 3000,
            });
          }
        }
      }

      // Validation de la réponse de l'API
      if (!availableData) {
        if (import.meta.env.DEV) {
          console.error('❌ Erreur de la recherche de praticien disponible:', lastError);
        }

        const message = errorMessage(lastError, 'Erreur inconnue');

        // Gestion des différents types d'erreurs
        if (message.includes('timeout') || message.includes('trop de temps') || message.includes('Délai')) {
          throw new Error('⏱️ Le serveur met trop de temps à répondre. Vérifiez votre connexion internet et réessayez.');
        } else if (message.includes('network') || message.includes('réseau') || message.includes('fetch') || message.includes('joindre le serveur')) {
          throw new Error('📡 Erreur réseau lors de la recherche de praticien. Vérifiez votre connexion internet.');
        } else {
          throw new Error(`❌ Erreur du serveur: ${message}`);
        }
      }

      if (typeof availableData !== 'object') {
        if (import.meta.env.DEV) {
          console.error('❌ Réponse invalide: type incorrect', typeof availableData);
        }
        throw new Error('🔧 Le serveur a retourné des données dans un format invalide.');
      }

      // Même forme que l'ancienne réponse de l'Edge Function
      const practitionerData = {
        success: availableData.found,
        practitioner: availableData.practitioner
          ? {
              id: availableData.practitioner.id,
              name: availableData.practitioner.name,
              specialty: availableData.practitioner.specialty ?? data.specialty,
              distance: availableData.practitioner.distanceKm,
            }
          : undefined,
        message: availableData.message,
      };

      // Aucun praticien disponible
      if (!practitionerData.success || !practitionerData.practitioner) {
        setIsSearchingPractitioner(false);
        
        // Formater la date pour l'affichage en français
        const formattedDate = format(data.date, 'dd/MM/yyyy', { locale: fr });
        
        if (import.meta.env.DEV) {
          console.warn('⚠️ Aucun praticien disponible dans les critères recherchés');
        }
        
        showToast({
          title: '😔 Aucun praticien disponible',
          description: `Aucun ${data.specialty} disponible dans un rayon de 100 km le ${formattedDate} à ${data.time}.`,
          variant: 'destructive',
          duration: 8000,
          action: (
            <Button 
              size="sm"
              onClick={async () => {
                // Créer une demande sans praticien assigné (mode manuel)
                try {
                  // L'API affecte le praticien validé le plus proche (même hors créneau) et prévient l'équipe.
                  const fallbackPayload = {
                    specialty: data.specialty,
                    date: data.date.toISOString(),
                    time: data.time,
                    reason: data.reason,
                    urgencyLevel: data.urgencyLevel,
                    latitude: position.latitude,
                    longitude: position.longitude,
                    fallbackMode: true,
                  };

                  const createdAppointment = await onSubmit(fallbackPayload);

                  if (createdAppointment?.id) {
                    showToast({
                      title: '✅ Demande enregistrée',
                      description: 'Votre demande a été transmise au praticien validé le plus proche. Vous serez notifié dès sa réponse ; notre équipe suit la demande.',
                      duration: 6000,
                    });
                    handleOpenChange(false);
                  }
                } catch (error) {
                  showToast({
                    title: 'Erreur',
                    description: 'Impossible d\'enregistrer la demande',
                    variant: 'destructive',
                    duration: 5000,
                  });
                }
              }}
            >
              Enregistrer quand même
            </Button>
          ),
        });
        return;
      }

      // Validation de l'objet praticien
      const practitioner = practitionerData.practitioner;
      if (!practitioner.id || !practitioner.name) {
        if (import.meta.env.DEV) {
          console.error('❌ Données praticien invalides:', practitioner);
        }
        throw new Error('🔧 Les informations du praticien sont incomplètes. Veuillez réessayer.');
      }

      if (import.meta.env.DEV) {
        console.log('✅ Praticien trouvé:', practitioner);
      }

      showToast({
        title: 'Praticien trouvé !',
        description: `${practitioner.name} (${practitioner.distance.toFixed(1)} km). En attente de confirmation...`,
        duration: 4000,
      });

      // 2. Créer le rendez-vous avec statut "awaiting_practitioner"
      const appointmentPayload = {
        specialty: data.specialty,
        date: data.date.toISOString(),
        time: data.time,
        reason: data.reason,
        urgencyLevel: data.urgencyLevel,
        practitionerId: practitioner.id,
        practitionerName: practitioner.name,
      };
      
      if (import.meta.env.DEV) {
        console.log('🔵 Création du rendez-vous en attente de confirmation du praticien...');
      }
      const createdAppointment = await onSubmit(appointmentPayload);
      if (import.meta.env.DEV) {
        console.log('✅ Rendez-vous créé, vérification de la réponse...', createdAppointment);
      }
      
      // Validation stricte du retour
      if (!createdAppointment) {
        throw new Error('💾 Le serveur n\'a retourné aucune donnée. La création du rendez-vous a échoué.');
      }

      if (typeof createdAppointment !== 'object') {
        throw new Error(`💾 Type de retour invalide: le serveur a retourné un ${typeof createdAppointment} au lieu d'un objet.`);
      }

      if (!('id' in createdAppointment) || !createdAppointment.id) {
        if (import.meta.env.DEV) {
          console.error('❌ Réponse invalide du serveur:', createdAppointment);
        }
        throw new Error('💾 L\'ID du rendez-vous n\'a pas été retourné par le serveur. Le rendez-vous n\'a peut-être pas été créé correctement.');
      }

      if (import.meta.env.DEV) {
        console.log('✅ Rendez-vous créé avec succès - ID:', createdAppointment.id);
      }
      
      handleOpenChange(false);
      setIsSearchingPractitioner(false);
      isSubmittingRef.current = false;
      setLocationMode('auto');
      setManualLocation({ address: '', latitude: null, longitude: null });
      form.reset({
        specialty: '',
        date: undefined,
        time: '',
        reason: '',
        urgencyLevel: 'non-urgent'
      });
      
      showToast({
        title: '✅ Demande envoyée avec succès',
        description: `Votre demande a été envoyée à ${practitioner.name}. Le praticien répondra généralement sous 30 minutes. Vous recevrez une notification dès qu'il acceptera.`,
        duration: 6000,
      });
      
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('❌ Erreur lors de la création du rendez-vous:', error);
      }
      setIsSearchingPractitioner(false);
      isSubmittingRef.current = false;
      
      // Message d'erreur détaillé
      let errorTitle = '❌ Erreur';
      let errorDescription = 'Impossible de créer le rendez-vous. Veuillez réessayer.';
      
      if (error instanceof Error) {
        errorDescription = error.message;
        
        // Classifier l'erreur pour un meilleur titre
        if (error.message.includes('💾')) {
          errorTitle = '💾 Erreur de sauvegarde';
        } else if (error.message.includes('timeout') || error.message.includes('⏱️')) {
          errorTitle = '⏱️ Délai dépassé';
        } else if (error.message.includes('network') || error.message.includes('réseau') || error.message.includes('📡')) {
          errorTitle = '📡 Erreur de connexion';
        } else if (error.message.includes('serveur') || error.message.includes('🔧')) {
          errorTitle = '🔧 Erreur du serveur';
        }
      }
      
      showToast({
        title: errorTitle,
        description: errorDescription,
        variant: 'destructive',
        duration: 6000,
      });
    }
  };
  
  const handleFormError = () => {
    const errors = form.formState.errors;
    const errorMessages = [];
    
    if (errors.specialty) errorMessages.push(errors.specialty.message || 'Spécialité manquante');
    if (errors.date) errorMessages.push(errors.date.message || 'Date manquante');
    if (errors.time) errorMessages.push(errors.time.message || 'Heure manquante');
    if (errors.reason) errorMessages.push(errors.reason.message || 'Raison invalide');
    
    if (errorMessages.length === 0) {
      errorMessages.push('Veuillez vérifier tous les champs du formulaire');
    }
    
    showToast({
      title: '❌ Formulaire incomplet',
      description: errorMessages.join('\n\n'),
      variant: 'destructive',
      duration: 6000,
    });
  };

  // Query dynamique pour récupérer les catégories disponibles
  const { data: availableCategories = [] } = useQuery({
    queryKey: ['available-categories'],
    queryFn: async () => {
      // Praticiens validés visibles publiquement (GET /practitioners)
      const data = await api.get<PublicPractitionerRow[]>('/practitioners', { query: { limit: 200 } });

      // Extraire les practitioner_type uniques
      const types = [...new Set(data.map(p => p.practitioner_type))];
      return types.filter((t): t is string => !!t && t.trim().length > 0);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allTimeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '12:00', '14:00', '14:30', '15:00',
    '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'
  ];

  // Récupérer les disponibilités du praticien pré-sélectionné
  const { data: practitionerAvailability = [], isLoading: isLoadingAvailability } = usePractitionerAvailability(
    preselectedPractitioner?.id
  );
  
  // Récupérer les exceptions du praticien pré-sélectionné
  const { data: practitionerExceptions = [], isLoading: isLoadingExceptions } = usePractitionerExceptions(
    preselectedPractitioner?.id
  );

  // Fonction pour comparer les heures
  const compareTime = (time1: string, time2: string): number => {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    if (h1 !== h2) return h1 - h2;
    return m1 - m2;
  };

  // Calculer les créneaux disponibles en fonction de la date et des disponibilités du praticien
  const getAvailableTimeSlots = useMemo(() => {
    const selectedDate = form.watch('date');
    
    // Si pas de date sélectionnée
    if (!selectedDate) {
      return { slots: [], message: 'Sélectionnez une date pour voir les créneaux disponibles' };
    }

    const dayOfWeek = selectedDate.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
    const dateString = format(selectedDate, 'yyyy-MM-dd');

    // Si praticien pré-sélectionné, vérifier ses disponibilités
    if (preselectedPractitioner) {
      // Vérifier les exceptions pour cette date
      const exception = practitionerExceptions.find(e => e.date === dateString);
      if (exception && !exception.is_available) {
        return { 
          slots: [], 
          message: `${preselectedPractitioner.name} n'est pas disponible ce jour${exception.reason ? ` (${exception.reason})` : ''}`
        };
      }

      // Récupérer les créneaux pour ce jour de la semaine
      const dayAvailability = practitionerAvailability.filter(
        a => a.day_of_week === dayOfWeek && a.is_active !== false
      );

      if (dayAvailability.length === 0) {
        const dayName = format(selectedDate, 'EEEE', { locale: fr });
        return { 
          slots: [], 
          message: `${preselectedPractitioner.name} n'a pas de créneaux configurés le ${dayName}` 
        };
      }

      // Filtrer les créneaux en fonction des disponibilités
      let availableSlots = allTimeSlots.filter(time => {
        const normalizedTime = time.substring(0, 5);
        return dayAvailability.some(slot => {
          const slotStart = slot.start_time.substring(0, 5);
          const slotEnd = slot.end_time.substring(0, 5);
          return compareTime(normalizedTime, slotStart) >= 0 && compareTime(normalizedTime, slotEnd) < 0;
        });
      });

      // Si c'est aujourd'hui, filtrer aussi les heures passées
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);

      if (selected.getTime() === today.getTime()) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();

        availableSlots = availableSlots.filter(time => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours > currentHour || (hours === currentHour && minutes > currentMinutes);
        });

        if (availableSlots.length === 0) {
          return { 
            slots: [], 
            message: 'Plus de créneaux disponibles aujourd\'hui. Veuillez sélectionner une autre date.' 
          };
        }
      }

      if (availableSlots.length === 0) {
        return { 
          slots: [], 
          message: `Aucun créneau disponible pour ${preselectedPractitioner.name} ce jour` 
        };
      }

      return { slots: availableSlots, message: null };
    }

    // Si pas de praticien pré-sélectionné, afficher tous les créneaux (filtrage date uniquement)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    if (selected.getTime() !== today.getTime()) {
      return { slots: allTimeSlots, message: null };
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    const filteredSlots = allTimeSlots.filter(time => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours > currentHour || (hours === currentHour && minutes > currentMinutes);
    });

    if (filteredSlots.length === 0) {
      return { 
        slots: [], 
        message: 'Plus de créneaux aujourd\'hui. Veuillez sélectionner une autre date.' 
      };
    }

    return { slots: filteredSlots, message: null };
  }, [form.watch('date'), preselectedPractitioner, practitionerAvailability, practitionerExceptions]);

  // Si open est contrôlé de l'extérieur, ne pas afficher le bouton trigger
  const isControlled = externalOpen !== undefined;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Nouveau rendez-vous
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {preselectedPractitioner 
              ? `Demander un rendez-vous avec ${preselectedPractitioner.name}` 
              : 'Demander un rendez-vous'}
          </DialogTitle>
          <DialogDescription>
            {preselectedPractitioner
              ? `Choisissez une date et un créneau pour votre rendez-vous avec ${preselectedPractitioner.name}`
              : 'Remplissez le formulaire pour demander un rendez-vous à domicile'}
          </DialogDescription>
        </DialogHeader>

        {/* Alertes GPS - masquées si praticien pré-sélectionné */}
        {!preselectedPractitioner && locationMode === 'auto' && position && (
          <Alert className={cn(
            "mb-4 border-2",
            quality?.level === 'excellent' ? "bg-green-50 border-green-300" :
            quality?.level === 'good' ? "bg-blue-50 border-blue-300" :
            quality?.level === 'fair' ? "bg-yellow-50 border-yellow-300" :
            "bg-orange-50 border-orange-300"
          )}>
            <MapPin className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <div>
                  <strong>Recherche automatique :</strong> Le système recherchera un praticien disponible dans un rayon de <strong>100 km</strong> autour de votre position actuelle.
                </div>
                <div className={cn("text-sm font-medium", quality?.color || "text-muted-foreground")}>
                  {quality?.message || 'Position obtenue'}
                  {isRefining && (
                    <span className="ml-2 inline-flex items-center">
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Affinage en cours...
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Coordonnées: {position.latitude.toFixed(6)}°, {position.longitude.toFixed(6)}°
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!preselectedPractitioner && locationMode === 'auto' && geoLoading && !position && (
          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription className="flex items-center justify-between">
              <span>📍 Localisation en cours... Veuillez autoriser l'accès à votre position GPS.</span>
            </AlertDescription>
          </Alert>
        )}

        {!preselectedPractitioner && locationMode === 'auto' && geoError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="space-y-2">
              <p>{geoError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={requestPosition}
                disabled={geoLoading}
                className="mt-2"
              >
                {geoLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    Localisation...
                  </>
                ) : (
                  '🔄 Réessayer la géolocalisation'
                )}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(handleSubmit, handleFormError)} 
            className="space-y-4"
            onKeyDown={(e) => {
              // Empêcher la soumission avec Enter si déjà en cours
              if (e.key === 'Enter' && (isFormSubmitting || isSubmittingRef.current || isSearchingPractitioner)) {
                e.preventDefault();
                if (import.meta.env.DEV) {
                  console.warn('⚠️ Soumission via Enter bloquée - déjà en cours');
                }
              }
            }}
          >
            {/* Section localisation - masquée si praticien pré-sélectionné */}
            {!preselectedPractitioner && (
              <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">Comment souhaitez-vous préciser le lieu d'intervention ?</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={locationMode === 'auto' ? 'default' : 'outline'}
                    onClick={() => {
                      setLocationMode('auto');
                      if (!position && !geoLoading) {
                        requestPosition();
                      }
                    }}
                    size="sm"
                    className="relative"
                  >
                    📍 Géolocalisation automatique
                    {locationMode === 'auto' && !position && !geoLoading && !geoError && (
                      <span className="ml-2 text-xs opacity-70">(Cliquez pour activer)</span>
                    )}
                    {locationMode === 'auto' && position && (
                      <span className="ml-2">✓</span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant={locationMode === 'manual' ? 'default' : 'outline'}
                    onClick={() => setLocationMode('manual')}
                    size="sm"
                  >
                    ✍️ Saisir l'adresse manuellement
                  </Button>
                </div>
                {locationMode === 'manual' && (
                  <AddressSearchInput
                    label="Adresse complète"
                    value={manualLocation.address}
                    onChange={(location) => {
                      setManualLocation({
                        address: location.address,
                        latitude: location.latitude ?? null,
                        longitude: location.longitude ?? null
                      });
                    }}
                    placeholder="Rechercher votre adresse au Bénin..."
                    required
                  />
                )}
              </div>
            )}

            {/* Afficher le praticien pré-sélectionné ou le sélecteur de spécialité */}
            {preselectedPractitioner ? (
              <div className="rounded-lg border p-4 bg-primary/5">
                <p className="text-sm font-medium text-muted-foreground mb-1">Praticien sélectionné</p>
                <p className="text-lg font-semibold">{preselectedPractitioner.name}</p>
                <p className="text-sm text-muted-foreground">
                  {getCategoryLabel(preselectedPractitioner.specialty)}
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="specialty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Catégorie de praticien <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={!field.value ? 'border-muted-foreground/30' : ''}>
                          <SelectValue placeholder="Choisissez une catégorie..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableCategories.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">Aucune catégorie disponible</div>
                        ) : (
                          availableCategories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {getCategoryLabel(category)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-xs font-medium" />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-sm font-medium">
                      Date souhaitée <span className="text-destructive">*</span>
                    </FormLabel>
                    <DatePopover
                      value={field.value}
                      onChange={(date) => {
                        field.onChange(date);
                        form.setValue('time', '');
                      }}
                      preselectedPractitioner={preselectedPractitioner}
                      practitionerAvailability={practitionerAvailability}
                      practitionerExceptions={practitionerExceptions}
                    />
                    <FormMessage className="text-xs font-medium" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Heure souhaitée <span className="text-destructive">*</span>
                    </FormLabel>
                    {(isLoadingAvailability || isLoadingExceptions) && preselectedPractitioner ? (
                      <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Chargement des disponibilités...</span>
                      </div>
                    ) : (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className={!field.value ? 'border-muted-foreground/30' : ''}>
                            <SelectValue placeholder="Sélectionnez un créneau..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getAvailableTimeSlots.slots.length > 0 ? (
                            getAvailableTimeSlots.slots.map((time) => (
                              <SelectItem key={time} value={time}>
                                {time}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                              <Clock className="h-4 w-4 mx-auto mb-2 opacity-50" />
                              {getAvailableTimeSlots.message || 'Aucun créneau disponible'}
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                    {preselectedPractitioner && getAvailableTimeSlots.slots.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {getAvailableTimeSlots.slots.length} créneau(x) disponible(s) selon les disponibilités de {preselectedPractitioner.name}
                      </p>
                    )}
                    <FormMessage className="text-xs font-medium" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="urgencyLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau d'urgence</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="non-urgent">Non urgent</SelectItem>
                      <SelectItem value="semi-urgent">Semi-urgent</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="immediate">Immédiat</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Motif de la consultation <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Décrivez brièvement la raison de votre demande (ex: fièvre persistante, douleurs, suivi médical...)..."
                      className={cn(
                        "min-h-[100px] resize-none",
                        field.value && field.value.length < 10 && "border-destructive/50",
                        field.value && field.value.length > 500 && "border-destructive"
                      )}
                      {...field}
                      maxLength={500}
                    />
                  </FormControl>
                  <div className="flex justify-between items-center text-xs">
                    <span className={cn(
                      "text-muted-foreground",
                      field.value && field.value.length < 10 && "text-destructive font-medium"
                    )}>
                      {field.value?.length || 0} / 10 minimum
                    </span>
                    <span className={cn(
                      "text-muted-foreground",
                      field.value && field.value.length > 450 && "text-orange-500 font-medium",
                      field.value && field.value.length >= 500 && "text-destructive font-medium"
                    )}>
                      Maximum: {field.value?.length || 0} / 500
                    </span>
                  </div>
                  <FormMessage className="text-xs font-medium" />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)} className="flex-1">
                Annuler
              </Button>
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={isSearchingPractitioner || geoLoading || isFormSubmitting || isSubmittingRef.current}
              >
                {isSearchingPractitioner || isFormSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isFormSubmitting ? 'Envoi en cours...' : 'Recherche...'}
                  </>
                ) : geoLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Localisation...
                  </>
                ) : (
                  'Envoyer la demande'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
