import { useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FileText, Calendar, User, AlertCircle, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Report {
  id: string;
  consultation_date: string;
  severity_level: string;
  consultation_type: string;
  consultation_reason?: string;
  clinical_findings?: string;
  primary_diagnosis?: string;
  treatment_prescription?: string;
  follow_up_timeframe: string;
  follow_up_recommendation?: string;
  additional_comments?: string;
  share_with_doctor?: boolean;
  appointments?: {
    practitioner_name: string;
  };
}

interface PatientConsultationReportsVirtualizedProps {
  reports: Report[];
  totalCount: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PatientConsultationReportsVirtualized({
  reports,
  totalCount,
  page,
  totalPages,
  onPageChange,
}: PatientConsultationReportsVirtualizedProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: reports.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 400,
    overscan: 2,
  });

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

  const handleDownloadPDF = (report: Report) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 20;

      // EN-TÊTE
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('RAPPORT DE CONSULTATION MÉDICALE', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // INFORMATIONS GÉNÉRALES
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const headerInfo = [
        ['Date de consultation', format(new Date(report.consultation_date), 'PPP à HH:mm', { locale: fr })],
        ['Praticien', report.appointments?.practitioner_name || 'Non spécifié'],
        ['Type de consultation', getConsultationType(report.consultation_type)],
        ['Niveau de gravité', report.severity_level.toUpperCase()],
      ];

      autoTable(doc, {
        startY: yPosition,
        body: headerInfo,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 'auto' },
        },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;

      // SECTIONS DE CONTENU
      const addSection = (title: string, content: string) => {
        if (!content) return;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 20, yPosition);
        yPosition += 7;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(content, pageWidth - 40);
        doc.text(lines, 20, yPosition);
        yPosition += lines.length * 5 + 8;

        // Nouvelle page si nécessaire
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
      };

      addSection('MOTIF DE LA CONSULTATION', report.consultation_reason || 'Non spécifié');
      addSection('CONSTATS CLINIQUES / SIGNES OBSERVÉS', report.clinical_findings || 'Non spécifié');
      addSection('DIAGNOSTIC PRINCIPAL', report.primary_diagnosis || 'Non spécifié');
      addSection('TRAITEMENT / PRESCRIPTION', report.treatment_prescription || 'Non spécifié');

      if (report.follow_up_recommendation) {
        addSection(
          `RECOMMANDATIONS DE SUIVI (${getFollowUpLabel(report.follow_up_timeframe)})`,
          report.follow_up_recommendation
        );
      }

      if (report.additional_comments) {
        addSection('COMMENTAIRES COMPLÉMENTAIRES', report.additional_comments);
      }

      // FOOTER
      if (report.share_with_doctor) {
        yPosition += 5;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('✓ Ce rapport peut être partagé avec votre médecin traitant', 20, yPosition);
      }

      // TÉLÉCHARGEMENT
      const fileName = `Rapport_Consultation_${format(new Date(report.consultation_date), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);

      toast({
        title: 'Rapport téléchargé',
        description: 'Le rapport a été téléchargé avec succès.',
      });
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de générer le PDF du rapport.',
        variant: 'destructive',
      });
    }
  };

  const startIndex = page * 10 + 1;
  const endIndex = Math.min((page + 1) * 10, totalCount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Mes rapports de consultation</h2>
          <p className="text-muted-foreground">Historique de vos consultations et rapports médicaux</p>
        </div>
        {totalCount > 0 && (
          <p className="text-sm text-muted-foreground">
            Affichage {startIndex}-{endIndex} sur {totalCount} rapport{totalCount > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div
        ref={parentRef}
        className="space-y-6 overflow-auto"
        style={{ height: '600px' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const report = reports[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <Card className="mb-4">
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

                    <div className="mt-6 pt-4 border-t">
                      <Button
                        onClick={() => handleDownloadPDF(report)}
                        variant="outline"
                        className="w-full"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Télécharger le rapport en PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} sur {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
