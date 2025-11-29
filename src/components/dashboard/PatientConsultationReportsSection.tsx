import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { usePatientConsultationReports } from '@/hooks/useConsultationReports';
import { PatientConsultationReportsVirtualized } from './PatientConsultationReportsVirtualized';

export function PatientConsultationReportsSection() {
  const { data: user } = useSupabaseUser();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  
  const { data: result, isLoading } = usePatientConsultationReports(
    user?.id, 
    page - 1,
    pageSize
  );
  
  const reports = result?.data || [];
  const totalCount = result?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

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
    <PatientConsultationReportsVirtualized
      reports={reports}
      totalCount={totalCount}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}

