import { useRef, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { FileText, Calendar, User, AlertCircle, ChevronLeft, ChevronRight, Download, RefreshCw, Search, Filter, ArrowUpDown, Stethoscope, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  onRefresh?: () => void;
  isFetching?: boolean;
}

export function PatientConsultationReportsVirtualized({
  reports,
  totalCount,
  page,
  totalPages,
  onPageChange,
  onRefresh,
  isFetching = false,
}: PatientConsultationReportsVirtualizedProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filtres et recherche
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Filtrer les rapports
  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    // Filtre par recherche
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.appointments?.practitioner_name?.toLowerCase().includes(query) ||
        r.primary_diagnosis?.toLowerCase().includes(query) ||
        r.consultation_reason?.toLowerCase().includes(query)
      );
    }

    // Filtre par sévérité
    if (severityFilter !== 'all') {
      filtered = filtered.filter(r => r.severity_level === severityFilter);
    }

    // Tri par date
    filtered.sort((a, b) => {
      const dateA = new Date(a.consultation_date).getTime();
      const dateB = new Date(b.consultation_date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return filtered;
  }, [reports, searchQuery, severityFilter, sortOrder]);

  // Statistiques
  const stats = useMemo(() => {
    return {
      total: reports.length,
      urgent: reports.filter(r => r.severity_level === 'urgent').length,
      modere: reports.filter(r => r.severity_level === 'modere').length,
      leger: reports.filter(r => r.severity_level === 'leger').length,
    };
  }, [reports]);

  const virtualizer = useVirtualizer({
    count: filteredReports.length,
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

      yPosition = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable.finalY + 10;

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
      {/* En-tête avec titre et refresh */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Mes rapports de consultation</h2>
          <Badge variant="secondary">{stats.total} rapport{stats.total > 1 ? 's' : ''}</Badge>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={isFetching}
              title="Rafraîchir"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Recherche */}
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full sm:w-[180px] h-9"
            />
          </div>

          {/* Filtre par sévérité */}
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sévérité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="modere">Modéré</SelectItem>
              <SelectItem value="leger">Léger</SelectItem>
            </SelectContent>
          </Select>

          {/* Tri */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="h-9"
          >
            <ArrowUpDown className="h-4 w-4 mr-1" />
            {sortOrder === 'desc' ? 'Récent' : 'Ancien'}
          </Button>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">Urgent</p>
              <p className="text-lg font-bold text-red-600">{stats.urgent}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">Modéré</p>
              <p className="text-lg font-bold text-yellow-600">{stats.modere}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Léger</p>
              <p className="text-lg font-bold text-green-600">{stats.leger}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Message si aucun résultat */}
      {filteredReports.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? `Aucun rapport trouvé pour "${searchQuery}"` : 'Aucun rapport correspondant aux filtres'}
            </p>
            <Button variant="link" onClick={() => { setSearchQuery(''); setSeverityFilter('all'); }} className="mt-2">
              Réinitialiser les filtres
            </Button>
          </CardContent>
        </Card>
      )}

      {filteredReports.length > 0 && (
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
            const report = filteredReports[virtualItem.index];
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <CardDescription className="cursor-help">
                                {report.consultation_date && format(new Date(report.consultation_date), 'dd MMM yyyy à HH:mm', { locale: fr })}
                              </CardDescription>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{report.consultation_date && format(new Date(report.consultation_date), 'EEEE d MMMM yyyy à HH:mm', { locale: fr })}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm line-clamp-2 cursor-help">{report.consultation_reason}</p>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-md">
                                  <p>{report.consultation_reason}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                        {report.clinical_findings && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Constat clinique / signes observés</p>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm line-clamp-2 cursor-help">{report.clinical_findings}</p>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-md">
                                  <p>{report.clinical_findings}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                        {report.primary_diagnosis && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Diagnostic principal</p>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm font-medium line-clamp-2 cursor-help">{report.primary_diagnosis}</p>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-md">
                                  <p>{report.primary_diagnosis}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm whitespace-pre-wrap line-clamp-3 cursor-help">{report.treatment_prescription}</p>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-md max-h-48 overflow-y-auto">
                                  <p className="whitespace-pre-wrap">{report.treatment_prescription}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Suivi recommandé</p>
                          <p className="text-sm font-medium">{getFollowUpLabel(report.follow_up_timeframe)}</p>
                          {report.follow_up_recommendation && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm mt-1 line-clamp-2 cursor-help">{report.follow_up_recommendation}</p>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-md">
                                  <p>{report.follow_up_recommendation}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        {report.additional_comments && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Commentaires complémentaires</p>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm line-clamp-2 cursor-help">{report.additional_comments}</p>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-md">
                                  <p>{report.additional_comments}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
      )}

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
