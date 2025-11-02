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
import { CalendarIcon, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { CreateAppointmentData } from '@/types/appointment';
import { PaymentDialog } from '@/components/PaymentDialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';

const formSchema = z.object({
  specialty: z.string().min(1, 'Veuillez sélectionner une spécialité'),
  date: z.date({ message: 'Veuillez sélectionner une date' }),
  time: z.string().min(1, 'Veuillez sélectionner une heure'),
  reason: z.string().min(10, 'Veuillez décrire la raison (minimum 10 caractères)').max(500),
  urgencyLevel: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface NewAppointmentDialogProps {
  onSubmit: (data: CreateAppointmentData) => Promise<any>;
}

export function NewAppointmentDialog({ onSubmit }: NewAppointmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [appointmentData, setAppointmentData] = useState<CreateAppointmentData | null>(null);
  const [createdAppointmentId, setCreatedAppointmentId] = useState<string | null>(null);
  const [isSearchingPractitioner, setIsSearchingPractitioner] = useState(false);
  
  const { position, requestPosition, loading: geoLoading } = useGeolocation();

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
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && !position && !geoLoading) {
      requestPosition();
      toast({
        title: 'Localisation requise',
        description: 'Nous avons besoin de votre localisation pour trouver un praticien près de vous.',
      });
    }
  };

  const handleSubmit = async (data: FormValues) => {
    console.log('🔵 Formulaire soumis avec les données:', data);
    
    // Vérifier la géolocalisation
    if (!position) {
      toast({
        title: 'Localisation requise',
        description: 'Nous avons besoin de votre localisation pour trouver un praticien près de vous.',
        variant: 'destructive'
      });
      requestPosition();
      return;
    }
    
    setIsSearchingPractitioner(true);
    
    try {
      // 1. Rechercher un praticien disponible
      console.log('🔍 Recherche d\'un praticien disponible...');
      
      const { data: practitionerData, error: practitionerError } = await supabase.functions.invoke(
        'find-available-practitioner',
        {
          body: {
            patientLat: position.latitude,
            patientLon: position.longitude,
            specialty: data.specialty,
            appointmentDate: data.date.toISOString().split('T')[0],
            appointmentTime: data.time,
            maxRadius: 5,
          },
        }
      );

      if (practitionerError) {
        throw new Error(practitionerError.message);
      }

      if (!practitionerData?.success || !practitionerData?.practitioner) {
        throw new Error(
          practitionerData?.message || 'Aucun praticien disponible trouvé dans votre zone'
        );
      }

      const practitioner = practitionerData.practitioner;
      console.log('✅ Praticien trouvé:', practitioner);

      toast({
        title: 'Praticien trouvé !',
        description: `${practitioner.name} (${practitioner.distance.toFixed(1)} km)`,
      });

      // 2. Créer le rendez-vous avec le praticien assigné
      const appointmentPayload = {
        specialty: data.specialty,
        date: data.date.toISOString(),
        time: data.time,
        reason: data.reason,
        urgencyLevel: data.urgencyLevel,
        practitionerId: practitioner.user_id,
        practitionerName: practitioner.name,
      };
      
      console.log('🔵 Création du rendez-vous avec praticien assigné...');
      const createdAppointment = await onSubmit(appointmentPayload);
      console.log('✅ Rendez-vous créé avec succès', createdAppointment);
      
      // Stocker l'ID du rendez-vous créé
      if (createdAppointment && typeof createdAppointment === 'object' && 'id' in createdAppointment) {
        setCreatedAppointmentId(createdAppointment.id as string);
      }
      
      setAppointmentData(appointmentPayload);
      setOpen(false);
      setIsSearchingPractitioner(false);
      
      // Ouvrir le dialogue de paiement après la création
      setPaymentDialogOpen(true);
      form.reset();
      
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
    
    if (errors.specialty) errorMessages.push('Veuillez sélectionner une spécialité');
    if (errors.date) errorMessages.push('Veuillez sélectionner une date');
    if (errors.time) errorMessages.push('Veuillez sélectionner une heure');
    if (errors.reason) errorMessages.push('Veuillez décrire la raison (minimum 10 caractères)');
    
    toast({
      title: 'Formulaire incomplet',
      description: errorMessages.join('\n'),
      variant: 'destructive'
    });
  };

  const handlePaymentSuccess = () => {
    // Le rendez-vous existe déjà, le paiement le confirmera
    setAppointmentData(null);
    setCreatedAppointmentId(null);
    setPaymentDialogOpen(false);
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

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit, handleFormError)} className="space-y-4">
            <FormField
              control={form.control}
              name="specialty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Spécialité recherchée</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez une spécialité" />
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date souhaitée</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP', { locale: fr })
                            ) : (
                              <span>Choisir une date</span>
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
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Heure souhaitée</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une heure" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeSlots.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
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
                  <FormLabel>Motif de la consultation</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Décrivez brièvement la raison de votre demande... (minimum 10 caractères)"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <div className="text-xs text-muted-foreground">
                    {field.value?.length || 0} / 10 caractères minimum
                  </div>
                  <FormMessage className="text-destructive font-medium" />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
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

    {appointmentData && createdAppointmentId && (
      <PaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        appointmentId={createdAppointmentId}
        amount={10000}
        onSuccess={handlePaymentSuccess}
      />
    )}
    </>
  );
}
