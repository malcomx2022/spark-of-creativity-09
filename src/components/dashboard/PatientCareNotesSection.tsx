import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  MessageSquare,
  Eye,
  Stethoscope,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePatientCareNotes } from '@/hooks/usePatientCareNotes';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function PatientCareNotesSection() {
  const { data: user } = useSupabaseUser();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: result, isLoading } = usePatientCareNotes(
    user?.id,
    page - 1,
    pageSize
  );

  const notes = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

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
            Notes cliniques au format SOAP partagées par vos praticiens
          </p>
        </div>
        {totalCount > 0 && (
          <Badge variant="outline">
            {totalCount} note{totalCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        {notes.map((note) => (
          <Card key={note.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Note de Soin - {note.appointments?.practitioner_name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {note.appointments?.date &&
                      format(new Date(note.appointments.date), 'PPP', { locale: fr })
                    }
                  </CardDescription>
                </div>
                <Badge variant="secondary">SOAP</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {note.subjective && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <h4 className="font-semibold text-blue-900">S - Subjectif</h4>
                  </div>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{note.subjective}</p>
                </div>
              )}

              {note.objective && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4 text-green-600" />
                    <h4 className="font-semibold text-green-900">O - Objectif</h4>
                  </div>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">{note.objective}</p>
                </div>
              )}

              {note.assessment && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Stethoscope className="h-4 w-4 text-purple-600" />
                    <h4 className="font-semibold text-purple-900">A - Analyse</h4>
                  </div>
                  <p className="text-sm text-purple-800 whitespace-pre-wrap">{note.assessment}</p>
                </div>
              )}

              {note.plan && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="h-4 w-4 text-orange-600" />
                    <h4 className="font-semibold text-orange-900">P - Plan</h4>
                  </div>
                  <p className="text-sm text-orange-800 whitespace-pre-wrap">{note.plan}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

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
    </div>
  );
}
