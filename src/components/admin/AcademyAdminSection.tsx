import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { GraduationCap, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { errorMessage } from '@/lib/api';
import {
  type AcademyAdminEnrollment,
  useAcademyAdminCancel,
  useAcademyAdminEnrollments,
  useAcademyAdminReports,
  useAcademyAdminRunJob,
  useAcademyAdminSyncState,
  useAcademyAdminWebhookEvents,
} from '@/hooks/useAcademy';

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ['all', 'PENDING', 'ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CERTIFIED', 'CANCELLED'] as const;
const when = (iso: string | null) => (iso ? format(new Date(iso), 'd MMM yyyy HH:mm', { locale: fr }) : '—');

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function CancelButton({ enrollment }: { enrollment: AcademyAdminEnrollment }) {
  const { toast } = useToast();
  const cancel = useAcademyAdminCancel();
  if (enrollment.status === 'CANCELLED' || enrollment.status === 'PENDING' || enrollment.hasCertificate) return null;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={cancel.isPending}>Désinscrire</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Désinscrire ce praticien ?</AlertDialogTitle>
          <AlertDialogDescription>
            {enrollment.learnerName ?? enrollment.email} perdra l’accès à « {enrollment.courseTitle} » chez Akambi. L’action est journalisée.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => cancel.mutate(enrollment.id, {
              onSuccess: () => toast({ title: 'Inscription annulée' }),
              onError: (e) => toast({ title: 'Désinscription impossible', description: errorMessage(e), variant: 'destructive' }),
            })}
          >
            Désinscrire
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AcademyAdminSection() {
  const { toast } = useToast();
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);
  const reports = useAcademyAdminReports();
  const sync = useAcademyAdminSyncState();
  const events = useAcademyAdminWebhookEvents('failed');
  const enrollments = useAcademyAdminEnrollments({ status: status === 'all' ? undefined : status, search: debouncedSearch.trim() || undefined, page, limit: PAGE_SIZE });
  const runJob = useAcademyAdminRunJob();
  const totalPages = Math.max(1, Math.ceil((enrollments.data?.total ?? 0) / PAGE_SIZE));

  const run = (job: 'academy.catalog.sync' | 'academy.enrollments.reconcile') => runJob.mutate(job, {
    onSuccess: (r) => toast({ title: r.skipped ? 'Synchronisation ignorée' : 'Synchronisation terminée' }),
    onError: (e) => toast({ title: 'Synchronisation en échec', description: errorMessage(e), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-semibold flex items-center gap-2"><GraduationCap className="h-5 w-5" /> DomiCares Academy</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={() => run('academy.catalog.sync')} disabled={runJob.isPending} className="h-auto whitespace-normal">
            <RefreshCw className="mr-2 h-4 w-4" /> Synchroniser le catalogue
          </Button>
          <Button variant="outline" size="sm" onClick={() => run('academy.enrollments.reconcile')} disabled={runJob.isPending} className="h-auto whitespace-normal">
            <RefreshCw className="mr-2 h-4 w-4" /> Rapprocher les inscriptions
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indicateurs</CardTitle>
          <CardDescription>Chiffres fournis par Akambi (définitions encore à valider) et décompte DomiCares.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : reports.error ? (
            <p className="text-sm text-destructive">{errorMessage(reports.error)}</p>
          ) : reports.data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Apprenants" value={reports.data.akambi.totals.learners} />
              <Stat label="Inscriptions" value={reports.data.akambi.totals.enrollments} />
              <Stat label="En cours" value={reports.data.akambi.totals.inProgress} />
              <Stat label="Attestations" value={reports.data.akambi.totals.certified} />
              <Stat label="Progression moyenne" value={`${reports.data.akambi.totals.averageProgress} %`} />
              <Stat label="Taux d’achèvement" value={`${reports.data.akambi.totals.completionRate} %`} />
              <Stat label="Réussite à l’examen" value={`${reports.data.akambi.exams.passRate} %`} />
              <Stat label="Attestations (DomiCares)" value={reports.data.local.certificates} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Synchronisations</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(sync.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune synchronisation exécutée.</p> : null}
          {(sync.data ?? []).map((s) => (
            <div key={s.key} className="flex flex-col sm:flex-row sm:justify-between gap-1 text-sm border-b last:border-0 pb-2">
              <span className="font-medium">{s.key === 'courses' ? 'Catalogue' : 'Inscriptions'}</span>
              <span>Dernier succès : {when(s.lastSuccessAt)}</span>
              {s.lastError ? <span className="text-destructive break-words">{s.lastError}</span> : <span className="text-muted-foreground">Sans erreur</span>}
            </div>
          ))}
          {events.data && events.data.total > 0 ? (
            <p className="text-sm text-destructive">{events.data.total} événement(s) Akambi en échec — dernier : {events.data.items[0]?.type} ({events.data.items[0]?.message ?? 'sans détail'}).</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inscriptions</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Input className="text-base sm:max-w-xs" placeholder="Nom, e-mail ou formation" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} aria-label="Rechercher une inscription" />
            <Select value={status} onValueChange={(v) => { setStatus(v as (typeof STATUS_OPTIONS)[number]); setPage(0); }}>
              <SelectTrigger className="sm:w-56" aria-label="Filtrer par statut"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'Tous les statuts' : s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {enrollments.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : enrollments.error ? (
            <p className="text-sm text-destructive">{errorMessage(enrollments.error)}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Praticien</TableHead>
                    <TableHead>Formation</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Progression</TableHead>
                    <TableHead>Mise à jour</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(enrollments.data?.items ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="min-w-40">
                        <p className="font-medium break-words">{e.learnerName ?? '—'}</p>
                        <p className="text-xs text-muted-foreground break-all">{e.email}</p>
                        {e.linkStatus !== 'linked' ? <Badge variant="destructive" className="mt-1">Compte {e.linkStatus}</Badge> : null}
                      </TableCell>
                      <TableCell className="min-w-40 break-words">{e.courseTitle}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{e.status}</Badge>
                        {e.lastErrorCode ? <p className="text-xs text-destructive mt-1">{e.lastErrorCode}</p> : null}
                      </TableCell>
                      <TableCell>{e.progress} %</TableCell>
                      <TableCell className="whitespace-nowrap">{when(e.updatedAt)}</TableCell>
                      <TableCell><CancelButton enrollment={e} /></TableCell>
                    </TableRow>
                  ))}
                  {(enrollments.data?.items ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Aucune inscription</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{enrollments.data?.total ?? 0} inscription(s) — page {page + 1}/{totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
