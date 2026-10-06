import type { ConsultationReport } from "@/hooks/useConsultationReports";
import { useState, useMemo } from 'react';
import { useConsultationReports } from '@/hooks/useConsultationReports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  FileText, AlertCircle, ChevronLeft, ChevronRight, Plus, HelpCircle, Eye,
  RefreshCw, Search, Filter, ClipboardList, TrendingUp, AlertTriangle
} from 'lucide-react';
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

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-700', bgColor: 'bg-red-100 border-red-500' },
  modere: { label: 'Modéré', color: 'text-yellow-700', bgColor: 'bg-yellow-100 border-yellow-500' },
  leger: { label: 'Léger', color: 'text-green-700', bgColor: 'bg-green-100 border-green-500' },
};

interface ConsultationReportSectionProps {
  practitionerId: string;
}

export const ConsultationReportSection = ({ practitionerId }: ConsultationReportSectionProps) => {
  const [page, setPage] = useState(0);
  const [showAppointmentSelection, setShowAppointmentSelection] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showReportDetail, setShowReportDetail] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ConsultationReport & { patientName: string }>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<{
    id: string;
    patientName: string;
    date: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const pageSize = 20;
  const { data: result, isLoading, refetch } = useConsultationReports(practitionerId, page, pageSize);
  const { data: appointmentsResult } = usePractitionerAppointments(practitionerId, 0, 100);

  const reports = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const appointments = appointmentsResult?.data || [];

  // Statistiques
  const stats = useMemo(() => {
    const bySeverity = { urgent: 0, modere: 0, leger: 0 };
    reports.forEach(r => {
      if (r.severity_level in bySeverity) {
        bySeverity[r.severity_level as keyof typeof bySeverity]++;
      }
    });
    return { total: totalCount, bySeverity };
  }, [reports, totalCount]);

  // Filtrer les rapports
  const filteredReports = useMemo(() => {
    let result = [...reports];

    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r => {
        const appointment = appointments.find(apt => apt.id === r.appointment_id);
        const patientName = appointment?.patientName?.toLowerCase() || '';
        const diagnosis = r.primary_diagnosis?.toLowerCase() || '';
        const reason = r.consultation_reason?.toLowerCase() || '';
        return patientName.includes(query) || diagnosis.includes(query) || reason.includes(query);
      });
    }

    // Filtre par sévérité
    if (severityFilter !== 'all') {
      result = result.filter(r => r.severity_level === severityFilter);
    }

    return result;
  }, [reports, searchQuery, severityFilter, appointments]);

  // Fonction de rafraîchissement
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Format date relative
  const formatReportDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: fr });
  };

  const formatFullDate = (dateString: string) => {
    return format(new Date(dateString), "EEEE d MMMM yyyy", { locale: fr });
  };

  const handleSelectAppointment = (appointmentId: string, patientName: string, appointmentDate: string) => {
    setSelectedAppointment({ id: appointmentId, patientName, date: appointmentDate });
    setShowAppointmentSelection(false);
    setShowReportForm(true);
  };

  const handleReportCreated = () => {
    setSelectedAppointment(null);
    setShowReportForm(false);
  };

  const handleViewReport = (report: ConsultationReport, patientName: string) => {
    setSelectedReport({ ...report, patientName });
    setShowReportDetail(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton en-tête */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-56 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton filtres */}
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 max-w-xs" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Skeleton rapports */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
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
      <div className="space-y-6">
        {/* En-tête global */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              Rapports de consultation
              {stats.total > 0 && (
                <Badge variant="secondary">{stats.total}</Badge>
              )}
            </h2>
            <p className="text-muted-foreground">
              Gérez vos rapports de consultation détaillés
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                Total
              </div>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-red-600 mb-1">
                <AlertTriangle className="h-4 w-4" />
                Urgents
              </div>
              <p className="text-2xl font-bold text-red-600">{stats.bySeverity.urgent}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-yellow-600 mb-1">
                <AlertCircle className="h-4 w-4" />
                Modérés
              </div>
              <p className="text-2xl font-bold text-yellow-600">{stats.bySeverity.modere}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-green-600 mb-1">
                <TrendingUp className="h-4 w-4" />
                Légers
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.bySeverity.leger}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par patient, diagnostic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="modere">Modéré</SelectItem>
              <SelectItem value="leger">Léger</SelectItem>
            </SelectContent>
          </Select>
          {(searchQuery || severityFilter !== 'all') && (
            <Badge variant="outline">
              {filteredReports.length} résultat{filteredReports.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Liste des rapports
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
                Rapports formels et détaillés pour consultations importantes
              </CardDescription>
            </div>
            <Button onClick={() => setShowAppointmentSelection(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau rapport
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
        {filteredReports.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            {searchQuery || severityFilter !== 'all' ? (
              <>
                <p className="text-muted-foreground">Aucun rapport ne correspond à vos critères</p>
                <Button
                  variant="link"
                  onClick={() => {
                    setSearchQuery('');
                    setSeverityFilter('all');
                  }}
                  className="mt-2"
                >
                  Réinitialiser les filtres
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Aucun rapport de consultation pour le moment</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Créez un rapport après une consultation importante
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowAppointmentSelection(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Créer mon premier rapport
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((report) => {
              const appointment = appointments.find(apt => apt.id === report.appointment_id);
              const patientName = appointment?.patientName || 'Patient inconnu';
              // ✅ CORRECTION P1-8: Détecter les rapports avec données manquantes
              const hasMissingData = !appointment;
              const severityConfig = SEVERITY_CONFIG[report.severity_level] || SEVERITY_CONFIG.leger;
              return (
                <div
                  key={report.id}
                  className={`border rounded-lg p-4 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors ${hasMissingData ? 'border-orange-300 bg-orange-50/50 dark:bg-orange-950/10' : ''}`}
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-sm text-muted-foreground cursor-help">
                              {formatReportDate(report.consultation_date)}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatFullDate(report.consultation_date)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={severityConfig.bgColor}>
                        <span className={severityConfig.color}>{severityConfig.label}</span>
                      </Badge>
                      <Button variant="ghost" size="icon" title="Voir les détails">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {report.primary_diagnosis && (
                    <p className="text-sm"><strong>Diagnostic:</strong> {report.primary_diagnosis}</p>
                  )}
                  {report.consultation_reason && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm text-muted-foreground line-clamp-2 cursor-help">
                            {report.consultation_reason}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-md">
                          <p className="whitespace-pre-wrap">{report.consultation_reason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
    </div>

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