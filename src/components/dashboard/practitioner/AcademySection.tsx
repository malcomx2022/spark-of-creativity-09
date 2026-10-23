import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Award, BookOpen, ExternalLink, GraduationCap, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ApiError, errorMessage } from '@/lib/api';
import {
  academyErrorCode,
  type AcademyCourse,
  type AcademyEnrollment,
  type AcademyEnrollmentStatus,
  useAcademyCertificate,
  useAcademyCertificateDownload,
  useAcademyCourses,
  useAcademyEnroll,
  useAcademyEnrollments,
  useAcademyLaunch,
} from '@/hooks/useAcademy';

const TYPE_LABELS: Record<AcademyCourse['type'], string> = { E_LEARNING: 'En ligne', VISIO_CONFERENCE: 'Visioconférence', PRESENTIEL: 'Présentiel' };
const STATUS_LABELS: Record<AcademyEnrollmentStatus, string> = {
  PENDING: 'Inscription en cours',
  ENROLLED: 'Inscrit',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CERTIFIED: 'Attestation délivrée',
  CANCELLED: 'Annulée',
};

const formatDate = (iso: string | null) => (iso ? format(new Date(iso), 'd MMMM yyyy', { locale: fr }) : null);

function CertificateBlock({ enrollmentId }: { enrollmentId: string }) {
  const { toast } = useToast();
  const certificate = useAcademyCertificate(enrollmentId, true);
  const download = useAcademyCertificateDownload();
  if (certificate.isLoading) return <Loader2 className="h-4 w-4 animate-spin" aria-label="Chargement de l’attestation" />;
  if (!certificate.data) return null;
  const c = certificate.data;
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-2 min-w-0">
      <p className="flex items-center gap-2 font-medium"><Award className="h-4 w-4 flex-shrink-0" /> Attestation n° <span className="break-all">{c.id}</span></p>
      <p className="text-sm text-muted-foreground">
        Délivrée le {formatDate(c.issuedAt)} à {c.learnerName}
        {c.score ? ` — ${c.score.correctAnswers}/${c.score.totalQuestions} bonnes réponses` : ''}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          size="sm"
          onClick={() => download.mutate(enrollmentId, { onError: (e) => toast({ title: 'Téléchargement impossible', description: errorMessage(e), variant: 'destructive' }) })}
          disabled={download.isPending}
          className="h-auto whitespace-normal"
        >
          {download.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Télécharger le PDF
        </Button>
        <Button size="sm" variant="outline" asChild className="h-auto whitespace-normal">
          <a href={c.verificationUrl} target="_blank" rel="noopener noreferrer">
            Lien de vérification <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function EnrollmentCard({ enrollment, onRetry, retrying }: { enrollment: AcademyEnrollment; onRetry: () => void; retrying: boolean }) {
  const { toast } = useToast();
  const launch = useAcademyLaunch();
  const accessible = enrollment.status !== 'PENDING' && enrollment.status !== 'CANCELLED';
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <CardTitle className="text-base break-words min-w-0">{enrollment.courseTitle}</CardTitle>
          <Badge variant={enrollment.status === 'CERTIFIED' ? 'default' : 'secondary'} className="self-start">{STATUS_LABELS[enrollment.status]}</Badge>
        </div>
        {enrollment.enrolledAt ? <CardDescription>Inscrit le {formatDate(enrollment.enrolledAt)}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {enrollment.status !== 'PENDING' && enrollment.status !== 'CANCELLED' ? (
          <div className="space-y-1">
            <div className="flex justify-between text-sm"><span>Progression</span><span>{enrollment.progress} %</span></div>
            <Progress value={enrollment.progress} aria-label={`Progression ${enrollment.progress} %`} />
          </div>
        ) : null}
        {enrollment.status === 'PENDING' ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <p className="text-sm text-muted-foreground">L’inscription n’a pas encore été confirmée par Akambi.</p>
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying} className="h-auto whitespace-normal">Réessayer</Button>
          </div>
        ) : null}
        {accessible ? (
          <div className="space-y-1">
            <Button
              onClick={() => launch.mutate(enrollment.id, { onError: (e) => toast({ title: 'Accès impossible', description: errorMessage(e), variant: 'destructive' }) })}
              disabled={launch.isPending}
              className="w-full sm:w-auto h-auto whitespace-normal"
            >
              {launch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Accéder à la formation
            </Button>
            <p className="text-xs text-muted-foreground">Si vous aviez déjà un compte Akambi Consulting, connectez-vous avec vos identifiants Akambi.</p>
          </div>
        ) : null}
        {enrollment.hasCertificate ? <CertificateBlock enrollmentId={enrollment.id} /> : null}
      </CardContent>
    </Card>
  );
}

export function AcademySection() {
  const { toast } = useToast();
  const courses = useAcademyCourses();
  // Inscriptions demandées une fois le catalogue obtenu : un 403/503 vaut pour toutes les routes Academy.
  const enrollments = useAcademyEnrollments(courses.isSuccess);
  const enroll = useAcademyEnroll();
  const [nameFor, setNameFor] = useState<string | null>(null);
  const [names, setNames] = useState({ firstName: '', lastName: '' });

  const active = useMemo(() => {
    const map = new Map<string, AcademyEnrollment>();
    for (const e of enrollments.data ?? []) if (e.status !== 'CANCELLED') map.set(e.courseId, e);
    return map;
  }, [enrollments.data]);

  const submit = (courseId: string, withNames?: { firstName: string; lastName: string }) => {
    enroll.mutate({ courseId, ...(withNames ?? {}) }, {
      onSuccess: (res) => {
        setNameFor(null);
        toast({ title: res.created ? 'Inscription confirmée' : 'Déjà inscrit', description: res.enrollment.courseTitle });
      },
      onError: (e) => {
        if (academyErrorCode(e) === 'LEARNER_NAME_REQUIRED') {
          setNameFor(courseId);
          return;
        }
        toast({ title: 'Inscription impossible', description: errorMessage(e), variant: 'destructive' });
      },
    });
  };

  if (courses.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" aria-label="Chargement" /></div>;
  if (courses.error) {
    const unavailable = courses.error instanceof ApiError && courses.error.status === 503;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> DomiCares Academy</CardTitle>
          <CardDescription>{unavailable ? 'DomiCares Academy n’est pas encore disponible. Revenez bientôt.' : errorMessage(courses.error)}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const mine = (enrollments.data ?? []).filter((e) => e.status !== 'CANCELLED');
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><GraduationCap className="h-5 w-5" /> DomiCares Academy</h2>
        <p className="text-sm text-muted-foreground">Formations proposées avec Akambi Consulting. Le cours se déroule sur la plateforme Akambi.</p>
      </div>

      {mine.length > 0 ? (
        <section className="space-y-3" aria-labelledby="academy-mine">
          <h3 id="academy-mine" className="font-medium">Mes formations</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {mine.map((e) => <EnrollmentCard key={e.id} enrollment={e} onRetry={() => submit(e.courseId)} retrying={enroll.isPending} />)}
          </div>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="academy-catalogue">
        <h3 id="academy-catalogue" className="font-medium">Catalogue</h3>
        {(courses.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Aucune formation n’est proposée pour le moment.</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {(courses.data ?? []).map((course) => {
            const enrollment = active.get(course.id);
            return (
              <Card key={course.id} className="min-w-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base break-words">{course.title}</CardTitle>
                  <CardDescription className="flex flex-wrap gap-2">
                    <Badge variant="outline">{TYPE_LABELS[course.type]}</Badge>
                    {course.moduleCount ? <span>{course.moduleCount} module(s)</span> : null}
                    {course.chapterCount ? <span>{course.chapterCount} chapitre(s)</span> : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {course.description ? <p className="text-sm text-muted-foreground line-clamp-4 break-words">{course.description}</p> : null}
                  {nameFor === course.id ? (
                    <form
                      className="space-y-2"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        submit(course.id, { firstName: names.firstName.trim(), lastName: names.lastName.trim() });
                      }}
                    >
                      <p className="text-sm">Indiquez votre prénom et votre nom : ils figureront sur vos attestations.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1 min-w-0">
                          <Label htmlFor={`first-${course.id}`}>Prénom</Label>
                          <Input id={`first-${course.id}`} className="text-base" value={names.firstName} onChange={(ev) => setNames((n) => ({ ...n, firstName: ev.target.value }))} required maxLength={100} autoComplete="given-name" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <Label htmlFor={`last-${course.id}`}>Nom</Label>
                          <Input id={`last-${course.id}`} className="text-base" value={names.lastName} onChange={(ev) => setNames((n) => ({ ...n, lastName: ev.target.value }))} required maxLength={100} autoComplete="family-name" />
                        </div>
                      </div>
                      <Button type="submit" disabled={enroll.isPending || !names.firstName.trim() || !names.lastName.trim()} className="w-full sm:w-auto h-auto whitespace-normal">Confirmer l’inscription</Button>
                    </form>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      {enrollment ? (
                        <Badge variant="secondary" className="self-start">{STATUS_LABELS[enrollment.status]}</Badge>
                      ) : (
                        <Button onClick={() => submit(course.id)} disabled={enroll.isPending} className="h-auto whitespace-normal">
                          {enroll.isPending && enroll.variables?.courseId === course.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpen className="mr-2 h-4 w-4" />}
                          S’inscrire
                        </Button>
                      )}
                      {course.presentationUrl ? (
                        <Button variant="outline" asChild className="h-auto whitespace-normal">
                          <a href={course.presentationUrl} target="_blank" rel="noopener noreferrer">Présentation <ExternalLink className="ml-2 h-4 w-4" /></a>
                        </Button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
