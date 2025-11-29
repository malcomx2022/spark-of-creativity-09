import { useState, useRef } from 'react';
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
import { CalendarIcon, Plus, Loader2, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { CreateAppointmentData } from '@/types/appointment';
import { toast } from '@/hooks/use-toast';
import { invokeEdgeFunctionWithRetry } from '@/lib/edge-function-retry';
import type { FindPractitionerResponse } from '@/types/edge-function-responses';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { AddressSearchInput } from './AddressSearchInput';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const formSchema = z.object({
  specialty: z.string().min(1, '❌ Vous devez sélectionner une spécialité médicale'),
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

interface NewAppointmentDialogProps {
  onSubmit: (data: CreateAppointmentData) => Promise<any>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewAppointmentDialog({ onSubmit, open: externalOpen, onOpenChange }: NewAppointmentDialogProps) {
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
      specialty: '',
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
        specialty: '',
        date: undefined,
        time: '',
        reason: '',
        urgencyLevel: 'non-urgent'
      });
      return;
    }

    if (locationMode === 'auto' && !position && !geoLoading) {
      requestPosition();
      toast({
        title: 'Localisation requise',
        description: 'Nous avons besoin de votre localisation pour trouver un praticien près de vous.',
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
      toast({
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
      toast({
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

    // Bloquer la soumission pendant le chargement GPS
    if (locationMode === 'auto' && geoLoading) {
      if (import.meta.env.DEV) {
        console.warn('⚠️ Géolocalisation en cours');
      }
      isSubmittingRef.current = false;
      toast({
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
      toast({
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
        toast({
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

        toast({
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
        toast({
          title: '❌ Adresse requise',
          description: 'Vous devez indiquer une adresse complète pour l\'intervention. Utilisez la recherche d\'adresse pour trouver votre localisation.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      if (manualLocation.address.trim().length < 10) {
        isSubmittingRef.current = false;
        toast({
          title: '❌ Adresse incomplète',
          description: 'L\'adresse semble trop courte. Veuillez fournir une adresse complète (rue, quartier, ville).',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      if (!manualLocation.latitude || !manualLocation.longitude) {
        isSubmittingRef.current = false;
        toast({
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

        toast({
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
        
        toast({
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
      
      // Appeler l'edge function avec retry et callback de progression
      const { data: practitionerData, error: practitionerError } = await invokeEdgeFunctionWithRetry<FindPractitionerResponse>(
        'find-available-practitioner',
        {
          body: {
            patientLat: position.latitude,
            patientLon: position.longitude,
            specialty: data.specialty,
            appointmentDate: appointmentDate,
            appointmentTime: data.time,
            maxRadius: 100,
          },
        },
        3, // 3 tentatives max
        (attempt, error) => {
          if (import.meta.env.DEV) {
            console.warn(`⚠️ Tentative ${attempt} échouée:`, error.message);
          }
          if (attempt === 1) {
            toast({
              title: '🔄 Recherche en cours...',
              description: 'Première tentative échouée, nouvelle tentative en cours.',
              duration: 3000,
            });
          }
        }
      );

      // Validation de la réponse de l'edge function
      if (practitionerError) {
        if (import.meta.env.DEV) {
          console.error('❌ Erreur de l\'edge function find-available-practitioner:', practitionerError);
        }
        
        const errorMessage = practitionerError.message || 'Erreur inconnue';
        
        // Gestion des différents types d'erreurs
        if (errorMessage.includes('timeout') || errorMessage.includes('trop de temps')) {
          throw new Error('⏱️ Le serveur met trop de temps à répondre. Vérifiez votre connexion internet et réessayez.');
        } else if (errorMessage.includes('network') || errorMessage.includes('réseau') || errorMessage.includes('fetch')) {
          throw new Error('📡 Erreur réseau lors de la recherche de praticien. Vérifiez votre connexion internet.');
        } else {
          throw new Error(`❌ Erreur du serveur: ${errorMessage}`);
        }
      }

      // Validation de la structure de la réponse
      if (!practitionerData) {
        if (import.meta.env.DEV) {
          console.error('❌ Réponse invalide: pas de données retournées');
        }
        throw new Error('🔧 Le serveur a retourné une réponse invalide. Veuillez contacter le support.');
      }

      if (typeof practitionerData !== 'object') {
        if (import.meta.env.DEV) {
          console.error('❌ Réponse invalide: type incorrect', typeof practitionerData);
        }
        throw new Error('🔧 Le serveur a retourné des données dans un format invalide.');
      }

      // Aucun praticien disponible
      if (!practitionerData.success || !practitionerData.practitioner) {
        setIsSearchingPractitioner(false);
        
        // Formater la date pour l'affichage en français
        const formattedDate = format(data.date, 'dd/MM/yyyy', { locale: fr });
        
        if (import.meta.env.DEV) {
          console.warn('⚠️ Aucun praticien disponible dans les critères recherchés');
        }
        
        toast({
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
                  const fallbackPayload = {
                    specialty: data.specialty,
                    date: data.date.toISOString(),
                    time: data.time,
                    reason: data.reason,
                    urgencyLevel: data.urgencyLevel,
                    fallbackMode: true,
                  };

                  const createdAppointment = await onSubmit(fallbackPayload);

                  if (createdAppointment?.id) {
                    toast({
                      title: '✅ Demande enregistrée',
                      description: 'Votre demande a été enregistrée. Notre équipe vous contactera sous 30 minutes pour trouver un praticien disponible.',
                      duration: 6000,
                    });
                    handleOpenChange(false);
                  }
                } catch (error) {
                  toast({
                    title: 'Erreur',
                    description: 'Impossible d\'enregistrer la demande',
                    variant: 'destructive'
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

      toast({
        title: 'Praticien trouvé !',
        description: `${practitioner.name} (${practitioner.distance.toFixed(1)} km). En attente de confirmation...`,
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
      
      toast({
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
      
      toast({
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
    
    toast({
      title: '❌ Formulaire incomplet',
      description: errorMessages.join('\n\n'),
      variant: 'destructive',
      duration: 6000,
    });
  };

  // Query dynamique pour récupérer les spécialités disponibles
  const { data: availableSpecialties = [] } = useQuery({
    queryKey: ['available-specialties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('specialty')
        .eq('available', true)
        .eq('kyc_status', 'approved');

      if (error) throw error;

      // Extraire les specialties uniques
      const specialties = [...new Set(data?.map(p => p.specialty) || [])];
      return specialties.filter(s => s && s.trim().length > 0).sort();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const timeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '12:00', '14:00', '14:30', '15:00',
    '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'
  ];

  // Filtrer les créneaux horaires si la date sélectionnée est aujourd'hui
  const getAvailableTimeSlots = () => {
    const selectedDate = form.watch('date');
    if (!selectedDate) return timeSlots;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    // Si la date sélectionnée n'est pas aujourd'hui, retourner tous les créneaux
    if (selected.getTime() !== today.getTime()) {
      return timeSlots;
    }

    // Si c'est aujourd'hui, filtrer les heures passées
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    const availableSlots = timeSlots.filter((time) => {
      const [hours, minutes] = time.split(':').map(Number);
      // Garder le créneau si l'heure est future ou si c'est l'heure actuelle mais les minutes sont futures
      return hours > currentHour || (hours === currentHour && minutes > currentMinutes);
    });

    // Si aucun créneau disponible aujourd'hui (après 18h par exemple)
    if (availableSlots.length === 0) {
      // Afficher un toast d'information pour guider l'utilisateur
      setTimeout(() => {
        toast({
          title: '⏰ Plus de créneaux aujourd\'hui',
          description: `Il est ${currentHour}h${String(currentMinutes).padStart(2, '0')}. Tous les créneaux d'aujourd'hui sont passés. Veuillez sélectionner une date ultérieure (demain ou plus tard).`,
          variant: 'destructive',
          duration: 8000,
        });
      }, 300); // Léger délai pour éviter les toasts simultanés
    }

    return availableSlots;
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nouveau rendez-vous
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Demander un rendez-vous</DialogTitle>
          <DialogDescription>
            Remplissez le formulaire pour demander un rendez-vous à domicile
          </DialogDescription>
        </DialogHeader>

        {locationMode === 'auto' && position && (
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

        {locationMode === 'auto' && geoLoading && !position && (
          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription className="flex items-center justify-between">
              <span>📍 Localisation en cours... Veuillez autoriser l'accès à votre position GPS.</span>
            </AlertDescription>
          </Alert>
        )}

        {locationMode === 'auto' && geoError && (
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

            <FormField
              control={form.control}
              name="specialty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Spécialité recherchée <span className="text-destructive">*</span>
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className={!field.value ? 'border-muted-foreground/30' : ''}>
                        <SelectValue placeholder="Choisissez une spécialité..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableSpecialties.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">Aucune spécialité disponible</div>
                      ) : (
                        availableSpecialties.map((specialty) => (
                          <SelectItem key={specialty} value={specialty}>
                            {specialty}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs font-medium" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-sm font-medium">
                      Date souhaitée <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground border-muted-foreground/30'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP', { locale: fr })
                            ) : (
                              <span>Sélectionnez une date...</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => {
                            // Comparer uniquement les dates (sans l'heure)
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const compareDate = new Date(date);
                            compareDate.setHours(0, 0, 0, 0);
                            
                            // Désactiver les dates strictement passées (avant aujourd'hui)
                            if (compareDate < today) return true;
                            // Désactiver les dimanches (jour 0)
                            if (date.getDay() === 0) return true;
                            return false;
                          }}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className={!field.value ? 'border-muted-foreground/30' : ''}>
                          <SelectValue placeholder="Sélectionnez un créneau..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getAvailableTimeSlots().length > 0 ? (
                          getAvailableTimeSlots().map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="p-2 text-sm text-muted-foreground text-center">
                            Aucun créneau disponible pour aujourd'hui
                          </div>
                        )}
                      </SelectContent>
                    </Select>
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
