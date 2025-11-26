import { useState } from 'react';
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
  const [manualAddress, setManualAddress] = useState('');

  const { position, requestPosition, loading: geoLoading, error: geoError } = useGeolocation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      specialty: '',
      time: '',
      reason: '',
      urgencyLevel: 'non-urgent'
    }
  });
  
  // Demander la localisation dès l'ouverture du dialogue
  const handleDialogOpenChange = (newOpen: boolean) => {
    handleOpenChange(newOpen);

    if (!newOpen) {
      setLocationMode('auto');
      setManualAddress('');
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
    console.log('🔵 Formulaire soumis avec les données:', data);

    // Vérification de la géolocalisation en mode automatique AVANT tout traitement
    if (locationMode === 'auto' && !position) {
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

    if (locationMode === 'manual') {
      // Validation de l'adresse manuelle
      if (!manualAddress.trim()) {
        toast({
          title: '❌ Adresse requise',
          description: 'Vous devez indiquer une adresse complète pour l\'intervention. Utilisez la recherche d\'adresse pour trouver votre localisation.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      if (manualAddress.trim().length < 10) {
        toast({
          title: '❌ Adresse incomplète',
          description: 'L\'adresse semble trop courte. Veuillez fournir une adresse complète (rue, quartier, ville).',
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
          addressOverride: manualAddress,
        };

        const createdAppointment = await onSubmit(appointmentPayload);

        if (createdAppointment && typeof createdAppointment === 'object' && 'id' in createdAppointment) {
          toast({
            title: '✅ Demande enregistrée avec succès',
            description: 'Votre demande a été envoyée. Notre équipe vous contactera sous 30 minutes pour affecter un praticien disponible et confirmer votre rendez-vous.',
            duration: 6000,
          });
          handleOpenChange(false);
          setIsSearchingPractitioner(false);
          setLocationMode('auto');
          setManualAddress('');
          form.reset({
            specialty: '',
            date: undefined,
            time: '',
            reason: '',
            urgencyLevel: 'non-urgent'
          });
        } else {
          throw new Error("Le rendez-vous n'a pas pu être créé");
        }
      } catch (error) {
        console.error('❌ Erreur:', error);
        setIsSearchingPractitioner(false);
        toast({
          title: 'Erreur',
          description: error instanceof Error ? error.message : 'Impossible de créer le rendez-vous. Veuillez réessayer.',
          variant: 'destructive',
        });
      }
      return;
    }

    setIsSearchingPractitioner(true);
    
    try {
      // 1. Rechercher un praticien disponible
      console.log('🔍 Recherche d\'un praticien disponible...');
      
      // Formater la date en YYYY-MM-DD en utilisant le fuseau horaire local
      const year = data.date.getFullYear();
      const month = String(data.date.getMonth() + 1).padStart(2, '0');
      const day = String(data.date.getDate()).padStart(2, '0');
      const appointmentDate = `${year}-${month}-${day}`;
      
      console.log('📅 Date formatée pour la recherche:', appointmentDate);
      
      const { data: practitionerData, error: practitionerError } = await invokeEdgeFunctionWithRetry<FindPractitionerResponse>(
        'find-available-practitioner',
        {
          body: {
            patientLat: position.latitude,
            patientLon: position.longitude,
            specialty: data.specialty,
            appointmentDate: appointmentDate,
            appointmentTime: data.time,
            maxRadius: 15,
          },
        }
      );

      if (practitionerError) {
        throw new Error(practitionerError.message);
      }

      if (!practitionerData?.success || !practitionerData?.practitioner) {
        setIsSearchingPractitioner(false);
        
        // Formater la date pour l'affichage en français
        const formattedDate = format(data.date, 'dd/MM/yyyy', { locale: fr });
        
        toast({
          title: 'Aucun praticien disponible',
          description: `Aucun praticien disponible le ${formattedDate} à ${data.time}. Veuillez choisir une autre date ou heure.`,
          variant: 'destructive',
        });
        return;
      }

      const practitioner = practitionerData.practitioner;
      console.log('✅ Praticien trouvé:', practitioner);

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
      
      console.log('🔵 Création du rendez-vous en attente de confirmation du praticien...');
      const createdAppointment = await onSubmit(appointmentPayload);
      console.log('✅ Rendez-vous créé avec succès', createdAppointment);
      
      if (createdAppointment && typeof createdAppointment === 'object' && 'id' in createdAppointment) {
        handleOpenChange(false);
        setIsSearchingPractitioner(false);
        setLocationMode('auto');
        setManualAddress('');
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
      } else {
        throw new Error('L\'ID du rendez-vous n\'a pas été retourné');
      }
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      setIsSearchingPractitioner(false);
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Impossible de créer le rendez-vous. Veuillez réessayer.',
        variant: 'destructive'
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

  const specialties = [
    'Médecine Générale',
    'Coaching Sportif',
  ];

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

    return timeSlots.filter((time) => {
      const [hours, minutes] = time.split(':').map(Number);
      // Garder le créneau si l'heure est future ou si c'est l'heure actuelle mais les minutes sont futures
      return hours > currentHour || (hours === currentHour && minutes > currentMinutes);
    });
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
          <Alert className="mb-4 bg-primary/5 border-primary/20">
            <MapPin className="h-4 w-4" />
            <AlertDescription>
              <strong>Recherche automatique :</strong> Le système recherchera un praticien disponible dans un rayon de <strong>15 km</strong> autour de votre position actuelle ({position.latitude.toFixed(4)}°, {position.longitude.toFixed(4)}°).
            </AlertDescription>
          </Alert>
        )}

        {locationMode === 'auto' && geoLoading && (
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
          <form onSubmit={form.handleSubmit(handleSubmit, handleFormError)} className="space-y-4">
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
                  value={manualAddress}
                  onChange={(location) => setManualAddress(location.address)}
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
                      {specialties.map((specialty) => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty}
                        </SelectItem>
                      ))}
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
                disabled={isSearchingPractitioner || geoLoading}
              >
                {isSearchingPractitioner ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Recherche...
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
