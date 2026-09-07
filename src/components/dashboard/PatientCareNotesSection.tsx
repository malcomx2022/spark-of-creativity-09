import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  User
} from 'lucide-react';
import { useAuthUser } from '@/hooks/useAuthUser';
import { usePatientCareNotes } from '@/hooks/usePatientCareNotes';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CareNoteDetailDialog } from './CareNoteDetailDialog';

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
    practitioner_name: string;
    date: string;
  };
}

export function PatientCareNotesSection() {
  const { data: user } = useAuthUser();
  const [page, setPage] = useState(1);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedNote, setSelectedNote] = useState<CareNote | null>(null);
  const pageSize = 10;

  const { data: result, isLoading } = usePatientCareNotes(
    user?.id,
    page - 1,
    pageSize
  );

  const notes = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleViewNote = (note: CareNote) => {
    setSelectedNote(note);
    setShowDetailDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Aucune note de soin partagée</p>
          <p className="text-sm text-muted-foreground mt-2">
            Les notes partagées par vos praticiens apparaîtront ici
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Mes Notes de Soin</h2>
          <p className="text-muted-foreground">
            Cliquez sur une note pour voir les détails et la télécharger
          </p>
        </div>
        {totalCount > 0 && (
          <Badge variant="outline">
            {totalCount} note{totalCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Notes cliniques SOAP
          </CardTitle>
          <CardDescription>
            Notes de suivi partagées par vos praticiens
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handleViewNote(note)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{note.appointments?.practitioner_name || 'Praticien'}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {note.appointments?.date && format(new Date(note.appointments.date), 'PPP', { locale: fr })}
                    </span>
                  </div>
                  {note.assessment && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                      Analyse: {note.assessment}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">SOAP</Badge>
                  <Button variant="ghost" size="icon">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
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
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      <CareNoteDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        note={selectedNote}
        userType="patient"
      />
    </div>
  );
}
