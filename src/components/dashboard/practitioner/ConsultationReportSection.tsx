import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePractitionerAppointments } from '@/hooks/useAppointments';
import { useCreateConsultationReport, useConsultationReportByAppointment } from '@/hooks/useConsultationReports';
import { toast } from 'sonner';
import { FileText, Save } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const consultationReportSchema = z.object({
  appointmentId: z.string().min(1, 'Veuillez sélectionner une consultation'),
  consultationType: z.string().min(1, 'Veuillez sélectionner un type'),
  consultationReason: z.string().min(10, 'Minimum 10 caractères').max(200),
  clinicalFindings: z.string().min(20, 'Minimum 20 caractères').max(400),
  primaryDiagnosis: z.string().optional(),
  treatmentPrescription: z.string().optional(),
  followUpTimeframe: z.string().min(1, 'Veuillez sélectionner un délai'),
  followUpRecommendation: z.string().optional(),
  additionalComments: z.string().optional(),
  severityLevel: z.string().min(1, 'Veuillez sélectionner un niveau'),
  shareWithDoctor: z.boolean().default(false),
});

type ConsultationReportForm = z.infer<typeof consultationReportSchema>;

export function ConsultationReportSection() {
  const { data: user } = useSupabaseUser();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string>('');

  const { data: practitioner } = useQuery({
    queryKey: ['practitioner', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('practitioners')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: appointments } = usePractitionerAppointments(practitioner?.id);
  const completedAppointments = appointments?.filter(apt => apt.status === 'completed') || [];

  const { data: existingReport } = useConsultationReportByAppointment(selectedAppointmentId);
  const createReport = useCreateConsultationReport();

  const form = useForm<ConsultationReportForm>({
    resolver: zodResolver(consultationReportSchema),
    defaultValues: {
      consultationType: '',
      consultationReason: '',
      clinicalFindings: '',
      primaryDiagnosis: '',
      treatmentPrescription: '',
      followUpTimeframe: '',
      followUpRecommendation: '',
      additionalComments: '',
      severityLevel: '',
      shareWithDoctor: false,
    },
  });

  const handleAppointmentSelect = (appointmentId: string) => {
    setSelectedAppointmentId(appointmentId);
    form.setValue('appointmentId', appointmentId);
  };

  const onSubmit = async (data: ConsultationReportForm) => {
    if (!practitioner?.id) {
      toast.error('Praticien non trouvé');
      return;
    }

    try {
      await createReport.mutateAsync({
        practitioner_id: practitioner.id,
        appointment_id: data.appointmentId,
        consultation_date: new Date().toISOString(),
        consultation_type: data.consultationType,
        consultation_reason: data.consultationReason,
        clinical_findings: data.clinicalFindings,
        primary_diagnosis: data.primaryDiagnosis || null,
        treatment_prescription: data.treatmentPrescription || null,
        follow_up_timeframe: data.followUpTimeframe,
        follow_up_recommendation: data.followUpRecommendation || null,
        additional_comments: data.additionalComments || null,
        severity_level: data.severityLevel,
        share_with_doctor: data.shareWithDoctor,
      });

      toast.success('Rapport de consultation enregistré avec succès');
      form.reset();
      setSelectedAppointmentId('');
    } catch (error) {
      console.error('Erreur lors de la création du rapport:', error);
      toast.error('Erreur lors de l\'enregistrement du rapport');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rapport de consultation
          </CardTitle>
          <CardDescription>
            Complétez le rapport de consultation pour le dossier patient
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label>Sélectionner une consultation terminée</Label>
            <Select onValueChange={handleAppointmentSelect} value={selectedAppointmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une consultation..." />
              </SelectTrigger>
              <SelectContent>
                {completedAppointments.map((apt) => (
                  <SelectItem key={apt.id} value={apt.id}>
                    {apt.patientName} - {apt.date} à {apt.time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAppointmentId && existingReport && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                Un rapport existe déjà pour cette consultation (créé le {new Date(existingReport.created_at).toLocaleDateString()})
              </p>
            </div>
          )}

          {selectedAppointmentId && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Informations générales</h3>
                  
                  <div>
                    <Label>Nom du praticien</Label>
                    <Input value={practitioner?.name || ''} disabled />
                  </div>

                  <FormField
                    control={form.control}
                    name="consultationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type de consultation *</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="domicile" id="domicile" />
                              <Label htmlFor="domicile">Consultation à domicile</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="teleconsultation" id="teleconsultation" />
                              <Label htmlFor="teleconsultation">Téléconsultation</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="suivi" id="suivi" />
                              <Label htmlFor="suivi">Suivi post-consultation</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">État du patient</h3>
                  
                  <FormField
                    control={form.control}
                    name="consultationReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Motif de la consultation * (100-200 caractères)</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Décrivez le motif de la consultation..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clinicalFindings"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Constat clinique / signes observés * (250-400 caractères)</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Décrivez les observations cliniques..." rows={4} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryDiagnosis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diagnostic principal (si applicable)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Hypertension artérielle (I10)" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Traitement et recommandations</h3>
                  
                  <FormField
                    control={form.control}
                    name="treatmentPrescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Traitement / prescription proposée</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Médicaments, dosages, durée..." rows={4} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="followUpTimeframe"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suivi ou rendez-vous recommandé *</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="24h" id="24h" />
                              <Label htmlFor="24h">Dans 24 h</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="3-7j" id="3-7j" />
                              <Label htmlFor="3-7j">Dans 3 à 7 jours</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="demande" id="demande" />
                              <Label htmlFor="demande">À la demande du patient</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="autre" id="autre" />
                              <Label htmlFor="autre">Autre</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch('followUpTimeframe') === 'autre' && (
                    <FormField
                      control={form.control}
                      name="followUpRecommendation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Préciser le suivi</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Précisez le suivi recommandé..." />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="additionalComments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commentaires / observations complémentaires</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Observations supplémentaires (facultatif)..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Statut du dossier</h3>
                  
                  <FormField
                    control={form.control}
                    name="severityLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Niveau de gravité évalué *</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="urgent" id="urgent" />
                              <Label htmlFor="urgent" className="text-red-600 font-medium">
                                Urgent – Réorientation vers un établissement de santé
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="modere" id="modere" />
                              <Label htmlFor="modere" className="text-yellow-600">
                                Modéré – Suivi nécessaire
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="leger" id="leger" />
                              <Label htmlFor="leger" className="text-green-600">
                                Léger – Observation simple
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shareWithDoctor"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Autoriser le partage de ce rapport avec le médecin traitant
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={createReport.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {createReport.isPending ? 'Enregistrement...' : 'Soumettre le rapport'}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
