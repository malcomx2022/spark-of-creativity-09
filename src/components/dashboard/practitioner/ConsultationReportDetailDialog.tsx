import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, X, FileText, Calendar, User, Stethoscope } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import jsPDF from "jspdf";

interface ConsultationReport {
  id: string;
  appointment_id: string;
  practitioner_id: string;
  consultation_date: string;
  consultation_type: string;
  severity_level: string;
  consultation_reason: string | null;
  clinical_findings: string | null;
  primary_diagnosis: string | null;
  treatment_prescription: string | null;
  follow_up_timeframe: string | null;
  follow_up_recommendation: string | null;
  additional_comments: string | null;
  share_with_doctor: boolean | null;
  created_at: string | null;
}

interface ConsultationReportDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ConsultationReport | null;
  patientName?: string;
  practitionerName?: string;
}

export function ConsultationReportDetailDialog({
  open,
  onOpenChange,
  report,
  patientName = "Patient",
  practitionerName = "Praticien",
}: ConsultationReportDetailDialogProps) {
  if (!report) return null;

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
    const types: Record<string, string> = {
      'consultation_generale': 'Consultation générale',
      'suivi': 'Suivi',
      'urgence': 'Urgence',
      'specialiste': 'Consultation spécialiste',
    };
    return types[type] || type;
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;
    const lineHeight = 7;
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("RAPPORT DE CONSULTATION", pageWidth / 2, y, { align: "center" });
    y += 15;

    // Date
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${format(new Date(report.consultation_date), 'dd MMMM yyyy', { locale: fr })}`, margin, y);
    y += lineHeight;

    // Patient
    doc.text(`Patient: ${patientName}`, margin, y);
    y += lineHeight;

    // Praticien
    doc.text(`Praticien: ${practitionerName}`, margin, y);
    y += lineHeight;

    // Type et sévérité
    doc.text(`Type: ${getConsultationType(report.consultation_type)}`, margin, y);
    y += lineHeight;
    doc.text(`Sévérité: ${report.severity_level}`, margin, y);
    y += 12;

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    const addSection = (title: string, content: string | null) => {
      if (!content) return;
      
      // Check if we need a new page
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, margin, y);
      y += lineHeight;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(content, maxWidth);
      lines.forEach((line: string) => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin, y);
        y += lineHeight - 1;
      });
      y += 5;
    };

    addSection("Motif de consultation", report.consultation_reason);
    addSection("Observations cliniques", report.clinical_findings);
    addSection("Diagnostic", report.primary_diagnosis);
    addSection("Traitement prescrit", report.treatment_prescription);
    addSection("Recommandations de suivi", report.follow_up_recommendation);
    if (report.follow_up_timeframe) {
      addSection("Délai de suivi", report.follow_up_timeframe);
    }
    addSection("Commentaires additionnels", report.additional_comments);

    // Footer
    y = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Rapport généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })}`, margin, y);

    doc.save(`rapport-consultation-${format(new Date(report.consultation_date), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rapport de Consultation
          </DialogTitle>
          <DialogDescription>
            Détails complets du rapport médical
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info header */}
          <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {format(new Date(report.consultation_date), 'dd MMMM yyyy', { locale: fr })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{patientName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{getConsultationType(report.consultation_type)}</span>
            </div>
            {getSeverityBadge(report.severity_level)}
          </div>

          <Separator />

          {/* Content sections */}
          <div className="space-y-4">
            {report.consultation_reason && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Motif de consultation</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.consultation_reason}</p>
              </div>
            )}

            {report.clinical_findings && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Observations cliniques</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.clinical_findings}</p>
              </div>
            )}

            {report.primary_diagnosis && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Diagnostic</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.primary_diagnosis}</p>
              </div>
            )}

            {report.treatment_prescription && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Traitement prescrit</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.treatment_prescription}</p>
              </div>
            )}

            {report.follow_up_recommendation && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Recommandations de suivi</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.follow_up_recommendation}</p>
              </div>
            )}

            {report.follow_up_timeframe && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Délai de suivi recommandé</h4>
                <p className="text-sm text-muted-foreground">{report.follow_up_timeframe}</p>
              </div>
            )}

            {report.additional_comments && (
              <div>
                <h4 className="font-semibold text-sm mb-1">Commentaires additionnels</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.additional_comments}</p>
              </div>
            )}

            {report.share_with_doctor && (
              <Badge variant="secondary" className="mt-2">
                Partagé avec le médecin traitant
              </Badge>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-2" />
              Fermer
            </Button>
            <Button onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-2" />
              Télécharger PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}