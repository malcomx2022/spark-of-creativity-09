import { useState } from 'react';
import { useConsultationReports } from '@/hooks/useConsultationReports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileText, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePractitionerAppointments } from '@/hooks/useAppointments';

interface ConsultationReportSectionProps {
  practitionerId: string;
}

export const ConsultationReportSection = ({ practitionerId }: ConsultationReportSectionProps) => {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { data: result, isLoading } = useConsultationReports(practitionerId, page, pageSize);
  const { data: appointmentsResult } = usePractitionerAppointments(practitionerId, 0, 100);
  
  const reports = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const appointments = appointmentsResult?.data || [];

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Rapports de consultation
        </CardTitle>
        <CardDescription>
          {totalCount} rapport(s) de consultation au total
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Aucun rapport de consultation pour le moment
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const appointment = appointments.find(apt => apt.id === report.appointment_id);
              return (
                <div key={report.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{appointment?.patientName || 'Patient inconnu'}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(report.consultation_date), 'dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                    {getSeverityBadge(report.severity_level)}
                  </div>
                  {report.primary_diagnosis && (
                    <p className="text-sm"><strong>Diagnostic:</strong> {report.primary_diagnosis}</p>
                  )}
                  {report.consultation_reason && (
                    <p className="text-sm text-muted-foreground">{report.consultation_reason}</p>
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
  );
};