import { useState } from 'react';
import { useConsultationReports } from '@/hooks/useConsultationReports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileText, AlertCircle, ChevronLeft, ChevronRight, Plus, HelpCircle, Eye, Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePractitionerAppointments } from '@/hooks/useAppointments';
import { AppointmentSelectionDialog } from './AppointmentSelectionDialog';
import { ConsultationReportFormDialog } from './ConsultationReportFormDialog';
import { ConsultationReportDetailDialog } from './ConsultationReportDetailDialog';

interface ConsultationReportSectionProps {
  practitionerId: string;
}

export const ConsultationReportSection = ({ practitionerId }: ConsultationReportSectionProps) => {
  const [page, setPage] = useState(0);
  const [showAppointmentSelection, setShowAppointmentSelection] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<{
    id: string;
    patientName: string;
    date: string;
  } | null>(null);

  const pageSize = 20;
  const { data: result, isLoading } = useConsultationReports(practitionerId, page, pageSize);
  const { data: appointmentsResult } = usePractitionerAppointments(practitionerId, 0, 100);
  
  const reports = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const appointments = appointmentsResult?.data || [];

  const handleSelectAppointment = (appointmentId: string, patientName: string, appointmentDate: string) => {
    setSelectedAppointment({ id: appointmentId, patientName, date: appointmentDate });
    setShowAppointmentSelection(false);
    setShowReportForm(true);
  };

  const handleReportCreated = () => {
    setSelectedAppointment(null);
    setShowReportForm(false);
  };

  const handleViewReport = (report: any, patientName: string) => {
    setSelectedReport({ ...report, patientName });
    setShowReportDetail(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rapports de consultation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Rapports de consultation
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="right">
                      <div className="space-y-2">
                        <p className="font-semibold">Quand utiliser les Rapports de Consultation ?</p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          <li>Consultations importantes</li>
                          <li>Diagnostics formels et détaillés</li>
                          <li>Documentation complète pour médecin traitant</li>
                          <li>Cas nécessitant un suivi médical spécifique</li>
                        </ul>
                        <p className="text-xs text-muted-foreground mt-2">
                          ℹ️ Ces rapports peuvent être partagés avec le médecin traitant du patient.
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>
                Rapports formels et détaillés pour consultations importantes • {totalCount} rapport(s) au total
              </CardDescription>
            </div>
            <Button onClick={() => setShowAppointmentSelection(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau rapport
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
        {reports.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Aucun rapport de consultation pour le moment. Cliquez sur "Nouveau rapport" pour en créer un.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const appointment = appointments.find(apt => apt.id === report.appointment_id);
              const patientName = appointment?.patientName || 'Patient inconnu';
              // ✅ CORRECTION P1-8: Détecter les rapports avec données manquantes
              const hasMissingData = !appointment;
              return (
                <div
                  key={report.id}
                  className={`border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors ${hasMissingData ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/10' : ''}`}
                  onClick={() => handleViewReport(report, patientName)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{patientName}</p>
                        {/* ✅ CORRECTION P1-8: Badge visuel pour données manquantes */}
                        {hasMissingData && (
                          <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Données partielles
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(report.consultation_date), 'dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getSeverityBadge(report.severity_level)}
                      <Button variant="ghost" size="icon" title="Voir les détails">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {report.primary_diagnosis && (
                    <p className="text-sm"><strong>Diagnostic:</strong> {report.primary_diagnosis}</p>
                  )}
                  {report.consultation_reason && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{report.consultation_reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} sur {totalPages} ({totalCount} rapports au total)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    <AppointmentSelectionDialog
      open={showAppointmentSelection}
      onOpenChange={setShowAppointmentSelection}
      practitionerId={practitionerId}
      onSelectAppointment={handleSelectAppointment}
    />

    {selectedAppointment && (
      <ConsultationReportFormDialog
        open={showReportForm}
        onOpenChange={setShowReportForm}
        practitionerId={practitionerId}
        appointmentId={selectedAppointment.id}
        appointmentDate={selectedAppointment.date}
        patientName={selectedAppointment.patientName}
        onSuccess={handleReportCreated}
      />
    )}

    <ConsultationReportDetailDialog
      open={showReportDetail}
      onOpenChange={setShowReportDetail}
      report={selectedReport}
      patientName={selectedReport?.patientName}
    />
    </>
  );
};