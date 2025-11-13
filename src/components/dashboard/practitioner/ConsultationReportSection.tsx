import { useMemo, useState, useEffect } from 'react';
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
import { useCreateConsultationReport, useConsultationReportByAppointment, useConsultationReports, ConsultationReport } from '@/hooks/useConsultationReports';
import { toast } from 'sonner';
import { FileText, Save, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import jsPDF from 'jspdf';
import { format } from 'date-fns';

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

const defaultFormValues: ConsultationReportForm = {
  appointmentId: '',
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
};

export function ConsultationReportSection() {
  const { data: user } = useSupabaseUser();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [reportToPreview, setReportToPreview] = useState<ConsultationReport | null>(null);

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
  const { data: allReports } = useConsultationReports(practitioner?.id);
  const createReport = useCreateConsultationReport();

  const form = useForm<ConsultationReportForm>({
    resolver: zodResolver(consultationReportSchema),
    defaultValues: defaultFormValues,
  });

  // Auto-save brouillon dans localStorage toutes les 30 secondes
  useEffect(() => {
    if (!selectedAppointmentId) return;

    const interval = setInterval(() => {
      const currentValues = form.getValues();
      // Ne sauvegarder que si des données ont été saisies
      const hasData = Object.values(currentValues).some(v => 
        v !== '' && v !== false && v !== undefined
      );
      
      if (hasData) {
        localStorage.setItem(
          `consultation_draft_${selectedAppointmentId}`,
          JSON.stringify({
            ...currentValues,
            savedAt: new Date().toISOString(),
          })
        );
        console.log('💾 Brouillon auto-sauvegardé');
      }
    }, 30000); // 30 secondes

    return () => clearInterval(interval);
  }, [form, selectedAppointmentId]);

  // Restaurer brouillon au montage si disponible
  useEffect(() => {
    if (!selectedAppointmentId) return;

    const draftKey = `consultation_draft_${selectedAppointmentId}`;
    const draft = localStorage.getItem(draftKey);
    
    if (draft && !existingReport) {
      try {
        const parsed = JSON.parse(draft);
        const savedAt = new Date(parsed.savedAt);
        const now = new Date();
        const hoursSince = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60);

        // Proposer restauration si < 24h
        if (hoursSince < 24) {
          const restore = window.confirm(
            `Un brouillon sauvegardé a été trouvé (${Math.round(hoursSince)}h). Voulez-vous le restaurer ?`
          );
          
          if (restore) {
            delete parsed.savedAt;
            form.reset(parsed);
            toast({
              title: "Brouillon restauré",
              description: "Vos données ont été récupérées",
            });
          } else {
            localStorage.removeItem(draftKey);
          }
        } else {
          // Supprimer les brouillons > 24h
          localStorage.removeItem(draftKey);
        }
      } catch (error) {
        console.error('Erreur restauration brouillon:', error);
      }
    }
  }, [selectedAppointmentId, existingReport, form]);

  const handleAppointmentSelect = (appointmentId: string) => {
    setSelectedAppointmentId(appointmentId);
    form.setValue('appointmentId', appointmentId);
  };

  useEffect(() => {
    if (existingReport) {
      form.reset({
        appointmentId: existingReport.appointment_id,
        consultationType: existingReport.consultation_type,
        consultationReason: existingReport.consultation_reason || '',
        clinicalFindings: existingReport.clinical_findings || '',
        primaryDiagnosis: existingReport.primary_diagnosis || '',
        treatmentPrescription: existingReport.treatment_prescription || '',
        followUpTimeframe: existingReport.follow_up_timeframe || '',
        followUpRecommendation: existingReport.follow_up_recommendation || '',
        additionalComments: existingReport.additional_comments || '',
        severityLevel: existingReport.severity_level,
        shareWithDoctor: existingReport.share_with_doctor || false,
      });
    } else {
      form.reset({
        ...defaultFormValues,
        appointmentId: selectedAppointmentId,
      });
    }
  }, [existingReport, selectedAppointmentId, form]);

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

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'urgent':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'modere':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Modéré</Badge>;
      case 'leger':
        return <Badge variant="outline" className="border-green-500 text-green-700">Léger</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getConsultationType = (type: string) => {
    switch (type) {
      case 'domicile':
        return 'À domicile';
      case 'teleconsultation':
        return 'Téléconsultation';
      case 'suivi':
        return 'Suivi';
      default:
        return type;
    }
  };

  const previewAppointment = useMemo(() => {
    if (!reportToPreview) return null;
    return appointments?.find(apt => apt.id === reportToPreview.appointment_id) || null;
  }, [appointments, reportToPreview]);

  const handlePreview = (report: ConsultationReport) => {
    setReportToPreview(report);
    setIsPreviewOpen(true);
  };

  const exportReportToPdf = (report: ConsultationReport) => {
    const appointment = appointments?.find(apt => apt.id === report.appointment_id);
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Rapport de consultation', 14, 20);

    doc.setFontSize(12);
    doc.text(`Patient : ${appointment?.patientName ?? 'N/A'}`, 14, 30);
    doc.text(`Praticien : ${practitioner?.name ?? 'N/A'}`, 14, 37);
    doc.text(`Date : ${format(new Date(report.consultation_date), 'dd/MM/yyyy')}`, 14, 44);
    doc.text(`Type : ${getConsultationType(report.consultation_type)}`, 14, 51);

    const addParagraph = (label: string, value: string | null | undefined, startY: number) => {
      const sanitized = value && value.trim().length > 0 ? value : 'Non renseigné';
      doc.setFont(undefined, 'bold');
      doc.text(`${label}`, 14, startY);
      doc.setFont(undefined, 'normal');
      const lines = doc.splitTextToSize(sanitized, 180);
      doc.text(lines, 14, startY + 6);
      return startY + lines.length * 6 + 8;
    };

    let cursor = 62;
    cursor = addParagraph('Motif', report.consultation_reason, cursor);
    cursor = addParagraph('Constat clinique', report.clinical_findings, cursor);
    cursor = addParagraph('Diagnostic principal', report.primary_diagnosis, cursor);
    cursor = addParagraph('Prescription / Traitement', report.treatment_prescription, cursor);
    cursor = addParagraph('Recommandations de suivi', report.follow_up_recommendation, cursor);
    cursor = addParagraph('Commentaires', report.additional_comments, cursor);

    doc.setFont(undefined, 'bold');
    doc.text(`Gravité : ${report.severity_level}`, 14, cursor);

    doc.save(`rapport-consultation-${report.id}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list">Liste des rapports</TabsTrigger>
          <TabsTrigger value="create">Nouveau rapport</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Rapports de consultation
              </CardTitle>
              <CardDescription>
                Liste de tous vos rapports de consultation
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!allReports || allReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Aucun rapport de consultation pour le moment</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Diagnostic</TableHead>
                        <TableHead>Gravité</TableHead>
                        <TableHead>Suivi</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allReports.map((report) => {
                        const appointment = appointments?.find(apt => apt.id === report.appointment_id);
                        return (
                          <TableRow key={report.id}>
                            <TableCell className="font-medium">
                              {new Date(report.consultation_date).toLocaleDateString()}
                            </TableCell>
                            <TableCell>{appointment?.patientName || 'N/A'}</TableCell>
                            <TableCell>{getConsultationType(report.consultation_type)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {report.primary_diagnosis || 'Non spécifié'}
                            </TableCell>
                            <TableCell>{getSeverityBadge(report.severity_level)}</TableCell>
                            <TableCell>{report.follow_up_timeframe}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePreview(report)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
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
        </TabsContent>
      </Tabs>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Rapport de consultation</DialogTitle>
            <DialogDescription>
              Détails complets du rapport pour {previewAppointment?.patientName ?? 'le patient'}
            </DialogDescription>
          </DialogHeader>
          {reportToPreview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-medium">{previewAppointment?.patientName ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(reportToPreview.consultation_date), 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{getConsultationType(reportToPreview.consultation_type)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gravité</p>
                  <div className="mt-1">{getSeverityBadge(reportToPreview.severity_level)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold">Motif</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reportToPreview.consultation_reason || 'Non renseigné'}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Constat clinique</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reportToPreview.clinical_findings || 'Non renseigné'}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Diagnostic principal</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reportToPreview.primary_diagnosis || 'Non renseigné'}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Prescription / Traitement</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reportToPreview.treatment_prescription || 'Non renseigné'}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Recommandations de suivi</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reportToPreview.follow_up_recommendation || 'Non renseigné'}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Commentaires additionnels</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{reportToPreview.additional_comments || 'Non renseigné'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">Aucun rapport sélectionné</div>
          )}
          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              Fermer
            </Button>
            {reportToPreview && (
              <Button onClick={() => exportReportToPdf(reportToPreview)}>
                <FileText className="h-4 w-4 mr-2" /> Exporter en PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
