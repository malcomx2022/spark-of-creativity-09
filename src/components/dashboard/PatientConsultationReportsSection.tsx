import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePatientConsultationReports } from '@/hooks/useConsultationReports';
import { FileText, Calendar, User, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';

export function PatientConsultationReportsSection() {
  const { data: user } = useSupabaseUser();
  const [page, setPage] = useState(0);
  const { data: reportsResult, isLoading } = usePatientConsultationReports(user?.id, page, 20);
  const reports = reportsResult?.data || [];
  const totalCount = reportsResult?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const getSeverityBadge = (level: string) => {
    switch (level) {
      case 'urgent':
        return <Badge variant="destructive">Urgent</Badge>;
      case 'modere':
        return <Badge variant="default" className="bg-yellow-500">Modéré</Badge>;
      case 'leger':
        return <Badge variant="secondary" className="bg-green-500 text-white">Léger</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  const getConsultationType = (type: string) => {
    switch (type) {
      case 'domicile':
        return 'Consultation à domicile';
      case 'teleconsultation':
        return 'Téléconsultation';
      case 'suivi':
        return 'Suivi post-consultation';
      default:
        return type;
    }
  };

  const getFollowUpLabel = (timeframe: string) => {
    switch (timeframe) {
      case '24h':
        return 'Dans 24h';
      case '3-7j':
        return 'Dans 3 à 7 jours';
      case 'demande':
        return 'À la demande du patient';
      case 'autre':
        return 'Autre (voir commentaires)';
      default:
        return timeframe;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Aucun rapport de consultation disponible</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Mes rapports de consultation</h2>
          <p className="text-muted-foreground">Historique de vos consultations et rapports médicaux</p>
        </div>
        {totalCount > 0 && (
          <p className="text-sm text-muted-foreground">
            Affichage {page * 20 + 1}-{Math.min((page + 1) * 20, totalCount)} sur {totalCount} rapport{totalCount > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {reports.map((report: any) => (
        <Card key={report.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Rapport de consultation
                </CardTitle>
                <CardDescription>
                  {report.consultation_date && format(new Date(report.consultation_date), 'PPP à HH:mm', { locale: fr })}
                </CardDescription>
              </div>
              {getSeverityBadge(report.severity_level)}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Informations générales */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                Informations générales
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                <div>
                  <p className="text-sm text-muted-foreground">Type de consultation</p>
                  <p className="font-medium">{getConsultationType(report.consultation_type)}</p>
                </div>
                {report.appointments && (
                  <div>
                    <p className="text-sm text-muted-foreground">Praticien</p>
                    <p className="font-medium">{report.appointments.practitioner_name}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* État du patient */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                État du patient
              </h3>
              <div className="space-y-4 pl-6">
                {report.consultation_reason && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Motif de la consultation</p>
                    <p className="text-sm">{report.consultation_reason}</p>
                  </div>
                )}
                {report.clinical_findings && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Constat clinique / signes observés</p>
                    <p className="text-sm">{report.clinical_findings}</p>
                  </div>
                )}
                {report.primary_diagnosis && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Diagnostic principal</p>
                    <p className="text-sm font-medium">{report.primary_diagnosis}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Traitement et recommandations */}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Traitement et recommandations
              </h3>
              <div className="space-y-4 pl-6">
                {report.treatment_prescription && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Traitement / prescription proposée</p>
                    <p className="text-sm whitespace-pre-wrap">{report.treatment_prescription}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Suivi recommandé</p>
                  <p className="text-sm font-medium">{getFollowUpLabel(report.follow_up_timeframe)}</p>
                  {report.follow_up_recommendation && (
                    <p className="text-sm mt-1">{report.follow_up_recommendation}</p>
                  )}
                </div>
                {report.additional_comments && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Commentaires complémentaires</p>
                    <p className="text-sm">{report.additional_comments}</p>
                  </div>
                )}
              </div>
            </div>

            {report.share_with_doctor && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  ✓ Ce rapport peut être partagé avec votre médecin traitant
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} sur {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
