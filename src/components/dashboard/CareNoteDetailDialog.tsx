import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  FileText, 
  MessageSquare, 
  Eye, 
  Stethoscope, 
  ClipboardList,
  Calendar,
  User
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import { toast } from '@/hooks/use-toast';

interface CareNote {
  id: string;
  appointment_id: string;
  practitioner_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  shared_with_patient: boolean;
  created_at: string;
  updated_at: string;
  appointments?: {
    practitioner_name?: string;
    patient_name?: string;
    date?: string;
    specialty?: string;
  };
}

interface CareNoteDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: CareNote | null;
  userType: 'practitioner' | 'patient';
}

export function CareNoteDetailDialog({ 
  open, 
  onOpenChange, 
  note,
  userType 
}: CareNoteDetailDialogProps) {
  if (!note) return null;

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPosition = 20;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Note de Soin - Format SOAP', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // Date and practitioner info
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      if (note.appointments?.date) {
        doc.text(`Date: ${format(new Date(note.appointments.date), 'PPP', { locale: fr })}`, margin, yPosition);
        yPosition += 7;
      }
      
      if (note.appointments?.practitioner_name) {
        doc.text(`Praticien: ${note.appointments.practitioner_name}`, margin, yPosition);
        yPosition += 7;
      }

      if (note.appointments?.patient_name) {
        doc.text(`Patient: ${note.appointments.patient_name}`, margin, yPosition);
        yPosition += 7;
      }

      if (note.appointments?.specialty) {
        doc.text(`Spécialité: ${note.appointments.specialty}`, margin, yPosition);
        yPosition += 7;
      }

      yPosition += 10;

      // SOAP Sections
      const sections = [
        { title: 'S - Subjectif', content: note.subjective, color: [59, 130, 246] },
        { title: 'O - Objectif', content: note.objective, color: [34, 197, 94] },
        { title: 'A - Analyse', content: note.assessment, color: [168, 85, 247] },
        { title: 'P - Plan', content: note.plan, color: [249, 115, 22] },
      ];

      sections.forEach(section => {
        if (section.content) {
          // Section title with colored background
          doc.setFillColor(section.color[0], section.color[1], section.color[2]);
          doc.rect(margin, yPosition - 5, pageWidth - margin * 2, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.text(section.title, margin + 3, yPosition);
          yPosition += 8;

          // Section content
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          
          const lines = doc.splitTextToSize(section.content, pageWidth - margin * 2);
          lines.forEach((line: string) => {
            if (yPosition > 270) {
              doc.addPage();
              yPosition = 20;
            }
            doc.text(line, margin, yPosition);
            yPosition += 6;
          });
          
          yPosition += 8;
        }
      });

      // Footer
      yPosition = Math.max(yPosition, 250);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Document généré le ${format(new Date(), 'PPP à HH:mm', { locale: fr })}`,
        pageWidth / 2,
        285,
        { align: 'center' }
      );

      // Download
      const fileName = `note_soap_${format(new Date(note.created_at), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);

      toast({
        title: 'Téléchargement réussi',
        description: 'La note de soin a été téléchargée en PDF.',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de générer le PDF.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Note de Soin - Format SOAP
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4 pt-2">
            {note.appointments?.date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(note.appointments.date), 'PPP', { locale: fr })}
              </span>
            )}
            {userType === 'patient' && note.appointments?.practitioner_name && (
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {note.appointments.practitioner_name}
              </span>
            )}
            {userType === 'practitioner' && note.appointments?.patient_name && (
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {note.appointments.patient_name}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {note.shared_with_patient && (
            <Badge variant="secondary" className="mb-2">
              Partagé avec le patient
            </Badge>
          )}

          {note.subjective && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h4 className="font-semibold text-blue-900 dark:text-blue-100">S - Subjectif</h4>
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">{note.subjective}</p>
            </div>
          )}

          {note.objective && (
            <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-green-600 dark:text-green-400" />
                <h4 className="font-semibold text-green-900 dark:text-green-100">O - Objectif</h4>
              </div>
              <p className="text-sm text-green-800 dark:text-green-200 whitespace-pre-wrap">{note.objective}</p>
            </div>
          )}

          {note.assessment && (
            <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Stethoscope className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <h4 className="font-semibold text-purple-900 dark:text-purple-100">A - Analyse</h4>
              </div>
              <p className="text-sm text-purple-800 dark:text-purple-200 whitespace-pre-wrap">{note.assessment}</p>
            </div>
          )}

          {note.plan && (
            <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <h4 className="font-semibold text-orange-900 dark:text-orange-100">P - Plan</h4>
              </div>
              <p className="text-sm text-orange-800 dark:text-orange-200 whitespace-pre-wrap">{note.plan}</p>
            </div>
          )}

          {!note.subjective && !note.objective && !note.assessment && !note.plan && (
            <div className="text-center py-8 text-muted-foreground">
              Aucune information disponible dans cette note.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 mr-2" />
            Télécharger PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
