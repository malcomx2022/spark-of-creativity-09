import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Trash2, RefreshCw, CalendarDays, TrendingUp, CalendarOff, CalendarCheck } from "lucide-react";
import { AddAvailabilityDialog } from '@/components/AddAvailabilityDialog';
import { AddExceptionDialog } from '@/components/AddExceptionDialog';
import { usePractitionerAvailability, usePractitionerExceptions, useDeleteAvailability, useDeleteException } from '@/hooks/useAvailability';
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface AvailabilitySectionProps {
  practitionerId: string;
  practitionerData: any;
}

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function AvailabilitySection({ practitionerId, practitionerData }: AvailabilitySectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(practitionerData?.is_online || false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'availability' | 'exception'; id: string; label: string } | null>(null);

  const { data: availabilities = [], isLoading: isLoadingAvailabilities, refetch: refetchAvailabilities } = usePractitionerAvailability(practitionerId);
  const { data: exceptions = [], isLoading: isLoadingExceptions, refetch: refetchExceptions } = usePractitionerExceptions(practitionerId);
  const deleteAvailability = useDeleteAvailability();
  const deleteException = useDeleteException();

  const isLoading = isLoadingAvailabilities || isLoadingExceptions;

  const exceptionDates = useMemo(() =>
    exceptions.reduce<Record<string, boolean>>((acc, exception) => {
      const dateKey = new Date(exception.date).toDateString();
      acc[dateKey] = exception.is_available ?? false;
      return acc;
    }, {}), [exceptions]);

  // Statistiques
  const stats = useMemo(() => {
    const totalSlots = availabilities.length;
    const daysWithSlots = new Set(availabilities.map(a => a.day_of_week)).size;

    // Calculer le total d'heures par semaine
    let totalMinutes = 0;
    availabilities.forEach(a => {
      if (a.start_time && a.end_time) {
        const [startH, startM] = a.start_time.split(':').map(Number);
        const [endH, endM] = a.end_time.split(':').map(Number);
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;
        totalMinutes += endTotal - startTotal;
      }
    });
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    const upcomingExceptions = exceptions.filter(e => new Date(e.date) >= new Date()).length;
    const unavailableExceptions = exceptions.filter(e => !e.is_available).length;

    return { totalSlots, daysWithSlots, totalHours, upcomingExceptions, unavailableExceptions };
  }, [availabilities, exceptions]);

  // Jours avec disponibilités pour le calendrier
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    availabilities.forEach(a => days.add(a.day_of_week));
    return days;
  }, [availabilities]);

  // Fonction de rafraîchissement
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchAvailabilities(), refetchExceptions()]);
      toast({
        title: "Actualisé",
        description: "Les disponibilités ont été rafraîchies.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de rafraîchir les données.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Formater la date d'exception
  const formatExceptionDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    if (date < now) {
      return format(date, "d MMMM yyyy", { locale: fr });
    }
    return formatDistanceToNow(date, { addSuffix: true, locale: fr });
  };

  const formatFullExceptionDate = (dateString: string) => {
    return format(new Date(dateString), "EEEE d MMMM yyyy", { locale: fr });
  };

  // Confirmer la suppression
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'availability') {
        await deleteAvailability.mutateAsync(deleteTarget.id);
        toast({ title: 'Créneau supprimé' });
      } else {
        await deleteException.mutateAsync(deleteTarget.id);
        toast({ title: 'Exception supprimée' });
      }
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de supprimer.', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggleOnline = async (checked: boolean) => {
    try {
      const { error } = await supabase
        .from("practitioners")
        .update({ is_online: checked })
        .eq("id", practitionerId);

      if (error) throw error;

      setIsOnline(checked);
      toast({
        title: checked ? "Vous êtes en ligne" : "Vous êtes hors ligne",
        description: checked 
          ? "Vous pouvez recevoir de nouvelles demandes."
          : "Vous ne recevrez plus de nouvelles demandes.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour votre statut.",
        variant: "destructive",
      });
    }
  };

  const formatICSDateTime = (date: Date) => {
    const iso = date.toISOString();
    return iso.replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const formatICSDate = (date: Date) => format(date, "yyyyMMdd");

  const handleExportICS = () => {
    if (!practitionerId || availabilities.length === 0) {
      toast({
        title: "Aucune disponibilité",
        description: "Ajoutez au moins un créneau avant d'exporter votre calendrier.",
        variant: "destructive",
      });
      return;
    }

    const daysToGenerate = 30;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const events: string[] = [];
    let uidCounter = 0;
    // ✅ CORRECTION P2-3: Compteur pour créneaux ignorés
    let skippedSlots = 0;

    for (let i = 0; i < daysToGenerate; i += 1) {
      const currentDate = new Date(now);
      currentDate.setDate(now.getDate() + i);
      const dateKey = currentDate.toDateString();

      if (exceptionDates[dateKey] === false) {
        // Indisponibilité totale déclarée, ne pas générer d'événements pour cette journée
        continue;
      }

      const dayAvailabilities = availabilities.filter((a) => a.day_of_week === currentDate.getDay());
      for (const availability of dayAvailabilities) {
        // ✅ CORRECTION P1-10: Validation des heures avant split
        if (!availability.start_time || !availability.end_time) {
          console.warn('Créneau avec heures invalides ignoré:', availability);
          skippedSlots++;
          continue;
        }

        const startParts = availability.start_time.split(":");
        const endParts = availability.end_time.split(":");

        if (startParts.length < 2 || endParts.length < 2) {
          console.warn('Format d\'heure invalide:', availability.start_time, availability.end_time);
          skippedSlots++;
          continue;
        }

        const [startHour, startMinute] = startParts.map(Number);
        const [endHour, endMinute] = endParts.map(Number);

        // Vérifier que les valeurs sont des nombres valides
        if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
          console.warn('Valeurs d\'heure non numériques:', availability);
          skippedSlots++;
          continue;
        }

        const start = new Date(currentDate);
        start.setHours(startHour, startMinute, 0, 0);
        const end = new Date(currentDate);
        end.setHours(endHour, endMinute, 0, 0);

        const summary = `Disponibilité ${practitionerData?.name ?? "Praticien"}`;
        const description = `Créneau disponible pour les rendez-vous (${DAYS_FR[currentDate.getDay()]})`;

        events.push([
          "BEGIN:VEVENT",
          `UID:${practitionerId}-${uidCounter}@domicares`,
          `DTSTAMP:${formatICSDateTime(new Date())}`,
          `DTSTART:${formatICSDateTime(start)}`,
          `DTEND:${formatICSDateTime(end)}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          "TRANSP:OPAQUE",
          "END:VEVENT",
        ].join("\n"));
        uidCounter += 1;
      }
    }

    for (const exception of exceptions) {
      if (exception.is_available) {
        continue;
      }

      const exceptionDate = new Date(exception.date);
      events.push([
        "BEGIN:VEVENT",
        `UID:${practitionerId}-exception-${uidCounter}@domicares`,
        `DTSTAMP:${formatICSDateTime(new Date())}`,
        `DTSTART;VALUE=DATE:${formatICSDate(exceptionDate)}`,
        `DTEND;VALUE=DATE:${formatICSDate(exceptionDate)}`,
        "SUMMARY:Indisponibilité",
        `DESCRIPTION:${exception.reason ?? "Indisponibilité déclarée"}`,
        "TRANSP:OPAQUE",
        "END:VEVENT",
      ].join("\n"));
      uidCounter += 1;
    }

    if (events.length === 0) {
      toast({
        title: "Rien à exporter",
        description: "Aucun événement à générer pour la période sélectionnée.",
        variant: "destructive",
      });
      return;
    }

    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//DomiCares//Availability//FR",
      "CALSCALE:GREGORIAN",
      ...events,
      "END:VCALENDAR",
    ].join("\n");

    const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `disponibilites-${format(new Date(), "yyyyMMdd")}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    // ✅ CORRECTION P2-3: Message approprié selon le résultat
    if (skippedSlots > 0) {
      toast({
        title: "Export réussi avec avertissement",
        description: `Votre planning a été téléchargé. ${skippedSlots} créneau(x) avec des données invalides ont été ignorés.`,
        variant: "default",
      });
    } else {
      toast({
        title: "Export réussi",
        description: "Votre planning vient d'être téléchargé.",
      });
    }
  };

  // Skeleton loading
  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton en-tête */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Skeleton stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton statut */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>

        {/* Skeleton planning */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête global */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Disponibilités
            {stats.totalSlots > 0 && (
              <Badge variant="secondary">{stats.totalSlots} créneaux</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Gérez vos créneaux et votre statut de disponibilité
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
              <Clock className="h-4 w-4" />
              Créneaux
            </div>
            <p className="text-2xl font-bold">{stats.totalSlots}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CalendarCheck className="h-4 w-4" />
              Jours actifs
            </div>
            <p className="text-2xl font-bold">{stats.daysWithSlots}/7</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Heures/semaine
            </div>
            <p className="text-2xl font-bold">{stats.totalHours}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CalendarOff className="h-4 w-4" />
              Exceptions
            </div>
            <p className="text-2xl font-bold">{stats.upcomingExceptions}</p>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer {deleteTarget?.label} ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Statut en ligne */}
      <Card>
        <CardHeader>
          <CardTitle>Statut de disponibilité</CardTitle>
          <CardDescription>Gérez votre disponibilité pour recevoir des demandes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isOnline ? "bg-green-500" : "bg-gray-400"} animate-pulse`} />
              <div>
                <p className="font-medium">{isOnline ? "En ligne" : "Hors ligne"}</p>
                <p className="text-sm text-muted-foreground">
                  {isOnline ? "Vous recevez des demandes" : "Vous ne recevez pas de demandes"}
                </p>
              </div>
            </div>
            <Switch checked={isOnline} onCheckedChange={handleToggleOnline} />
          </div>
        </CardContent>
      </Card>

      {/* Planning hebdomadaire */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Planning hebdomadaire
                <Badge variant="outline">{stats.totalSlots} créneaux</Badge>
              </CardTitle>
              <CardDescription>Créneaux répétitifs par jour de la semaine</CardDescription>
            </div>
            <AddAvailabilityDialog practitionerId={practitionerId} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DAYS_FR.map((day, index) => {
              const dayAvailabilities = availabilities.filter(a => a.day_of_week === index);
              const hasSlots = dayAvailabilities.length > 0;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                    hasSlots ? 'hover:bg-muted/30 border-green-200 dark:border-green-900' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${hasSlots ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="font-medium">{day}</span>
                    {hasSlots && (
                      <Badge variant="secondary" className="text-xs">
                        {dayAvailabilities.length} créneau{dayAvailabilities.length > 1 ? 'x' : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {dayAvailabilities.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Non disponible</span>
                    ) : (
                      dayAvailabilities.map((avail) => (
                        <div key={avail.id} className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="cursor-help">
                                  {avail.start_time.substring(0, 5)} - {avail.end_time.substring(0, 5)}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Créneau de {(() => {
                                  const [startH, startM] = avail.start_time.split(':').map(Number);
                                  const [endH, endM] = avail.end_time.split(':').map(Number);
                                  const duration = (endH * 60 + endM) - (startH * 60 + startM);
                                  const hours = Math.floor(duration / 60);
                                  const mins = duration % 60;
                                  return hours > 0 ? `${hours}h${mins > 0 ? mins : ''}` : `${mins}min`;
                                })()}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleteTarget({
                              type: 'availability',
                              id: avail.id,
                              label: `le créneau ${avail.start_time.substring(0, 5)} - ${avail.end_time.substring(0, 5)} du ${day}`
                            })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Calendrier et exceptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Exceptions et congés
                {exceptions.length > 0 && (
                  <Badge variant="outline">{exceptions.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>Jours fériés, congés et indisponibilités</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportICS}
            >
              Exporter ICS
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
                modifiers={{
                  available: (date) => availableDays.has(date.getDay()),
                  exception: (date) => exceptionDates[date.toDateString()] !== undefined,
                  unavailable: (date) => exceptionDates[date.toDateString()] === false,
                }}
                modifiersStyles={{
                  available: { backgroundColor: 'rgb(34 197 94 / 0.1)' },
                  exception: { border: '2px solid rgb(234 179 8)' },
                  unavailable: { backgroundColor: 'rgb(239 68 68 / 0.1)' },
                }}
              />
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-500/20" />
                  <span>Disponible</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-500/20" />
                  <span>Indisponible</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded border-2 border-yellow-500" />
                  <span>Exception</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                Exceptions à venir
                {stats.upcomingExceptions > 0 && (
                  <Badge variant="secondary">{stats.upcomingExceptions}</Badge>
                )}
              </h4>
              {exceptions.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Aucune exception programmée</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ajoutez des congés ou jours d'indisponibilité
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {exceptions.map((exception) => (
                    <div
                      key={exception.id}
                      className={`p-3 border rounded-lg hover:bg-muted/30 transition-colors ${
                        exception.is_available ? 'border-green-200 dark:border-green-900' : 'border-red-200 dark:border-red-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={exception.is_available ? 'default' : 'destructive'} className="text-xs">
                              {exception.is_available ? 'Disponible' : 'Indisponible'}
                            </Badge>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-sm text-muted-foreground mt-1 cursor-help">
                                  {formatExceptionDate(exception.date)}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{formatFullExceptionDate(exception.date)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {exception.reason && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{exception.reason}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTarget({
                            type: 'exception',
                            id: exception.id,
                            label: `l'exception du ${formatFullExceptionDate(exception.date)}`
                          })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <AddExceptionDialog practitionerId={practitionerId} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}