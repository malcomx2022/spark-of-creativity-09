import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Calendar } from 'lucide-react';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePatientConsultationReports } from '@/hooks/useConsultationReports';
import { PatientConsultationReportsVirtualized } from './PatientConsultationReportsVirtualized';
import { Skeleton } from '@/components/ui/skeleton';

export function PatientConsultationReportsSection() {
  const { data: user } = useSupabaseUser();
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: result, isLoading, isFetching, refetch } = usePatientConsultationReports(
    user?.id,
    page - 1,
    pageSize
  );

  const reports = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">Aucun rapport de consultation disponible</p>
          <p className="text-sm text-muted-foreground mb-4">
            Les rapports apparaîtront ici après vos consultations avec un praticien.
          </p>
          <Button onClick={() => window.location.href = '/patient-dashboard?tab=appointments'}>
            <Calendar className="h-4 w-4 mr-2" />
            Prendre un rendez-vous
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <PatientConsultationReportsVirtualized
      reports={reports}
      totalCount={totalCount}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      onRefresh={refetch}
      isFetching={isFetching}
    />
  );
}

