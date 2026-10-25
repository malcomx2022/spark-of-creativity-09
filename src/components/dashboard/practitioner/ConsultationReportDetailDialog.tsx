import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, X, FileText, Calendar, User, Stethoscope } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { loadPdf } from "@/lib/pdf";
import { toast } from "@/hooks/use-toast";
import QRCode from "qrcode";
import logoImage from "@/assets/logo.png";

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

  const generateSecureHash = (reportData: ConsultationReport): string => {
    // Create a simple hash from report data for verification
    const dataString = `${reportData.id}|${reportData.consultation_date}|${reportData.practitioner_id}`;
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  };

  const generatePdf = async () => {
    const { jsPDF } = await loadPdf();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 15;
    const lineHeight = 7;
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;

    // Generate secure verification data
    const secureHash = generateSecureHash(report);
    const verificationUrl = `${window.location.origin}/verify-report/${report.id}?hash=${secureHash}`;
    
    // Generate QR code
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(verificationUrl, {
        width: 80,
        margin: 1,
        color: {
          dark: '#1a365d',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('Error generating QR code:', err);
    }

    // Load logo and add to PDF
    const addLogoAndHeader = () => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // Add logo (left side)
          const logoWidth = 35;
          const logoHeight = (img.height / img.width) * logoWidth;
          doc.addImage(img, 'PNG', margin, y, logoWidth, logoHeight);
          
          // Company header text (right side of logo)
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(26, 54, 93); // Dark blue
          doc.text("DOMICARES", margin + logoWidth + 10, y + 8);
          
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("Soins médicaux à domicile", margin + logoWidth + 10, y + 14);
          doc.text("www.domicares.com", margin + logoWidth + 10, y + 19);
          
          // QR Code (right side)
          if (qrDataUrl) {
            const qrSize = 25;
            doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - qrSize, y, qrSize, qrSize);
            doc.setFontSize(6);
            doc.setTextColor(100, 100, 100);
            doc.text("Scan pour vérifier", pageWidth - margin - qrSize + 2, y + qrSize + 4);
          }
          
          resolve();
        };
        img.onerror = () => {
          // If logo fails to load, just add text header
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(26, 54, 93);
          doc.text("DOMICARES", margin, y + 10);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text("Soins médicaux à domicile", margin, y + 16);
          
          if (qrDataUrl) {
            const qrSize = 25;
            doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - qrSize, y, qrSize, qrSize);
          }
          
          resolve();
        };
        img.src = logoImage;
      });
    };

    await addLogoAndHeader();
    
    y += 35;
    
    // Decorative line
    doc.setDrawColor(26, 54, 93);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 54, 93);
    doc.text("RAPPORT DE CONSULTATION MÉDICALE", pageWidth / 2, y, { align: "center" });
    y += 12;

    // Report info box
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, pageWidth - 2 * margin, 28, 3, 3, 'F');
    y += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(`Date: ${format(new Date(report.consultation_date), 'dd MMMM yyyy', { locale: fr })}`, margin + 5, y);
    doc.text(`Réf: ${report.id.substring(0, 8).toUpperCase()}`, pageWidth - margin - 40, y);
    y += 7;
    doc.text(`Patient: ${patientName}`, margin + 5, y);
    y += 7;
    doc.text(`Praticien: ${practitionerName}`, margin + 5, y);
    doc.text(`Type: ${getConsultationType(report.consultation_type)}`, pageWidth / 2, y);
    y += 15;

    // Reset text color for content
    doc.setTextColor(40, 40, 40);

    const addSection = (title: string, content: string | null) => {
      if (!content) return;
      
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(26, 54, 93);
      doc.text(title, margin, y);
      y += lineHeight;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      const lines = doc.splitTextToSize(content, maxWidth);
      lines.forEach((line: string) => {
        if (y > 275) {
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

    // Footer with security info
    y = pageHeight - 25;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
    
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text(`Document généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })}`, margin, y);
    doc.text(`Code de vérification: ${secureHash}`, margin, y + 4);
    doc.text("Ce document est certifié par Domicares. Scannez le QR code pour vérifier son authenticité.", margin, y + 8);
    
    // Domicares branding footer
    doc.setFontSize(8);
    doc.setTextColor(26, 54, 93);
    doc.text("DOMICARES - Votre santé, notre priorité", pageWidth - margin, y + 4, { align: "right" });

    doc.save(`rapport-consultation-domicares-${format(new Date(report.consultation_date), 'yyyy-MM-dd')}.pdf`);
  };

  // jsPDF est chargé à la demande : un échec (hors ligne) ne doit pas passer inaperçu.
  const handleDownloadPDF = async () => {
    try {
      await generatePdf();
    } catch (error) {
      console.error('PDF export error:', error);
      toast({ title: "Erreur d'export", description: 'Impossible de générer le PDF', variant: 'destructive' });
    }
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