import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calendar as CalendarIcon, Clock, Plus, Trash2 } from "lucide-react";
import { AddAvailabilityDialog } from '@/components/AddAvailabilityDialog';
import { AddExceptionDialog } from '@/components/AddExceptionDialog';
import { usePractitionerAvailability, usePractitionerExceptions, useDeleteAvailability, useDeleteException } from '@/hooks/useAvailability';

interface AvailabilitySectionProps {
  practitionerId: string;
  practitionerData: any;
}

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function AvailabilitySection({ practitionerId, practitionerData }: AvailabilitySectionProps) {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(practitionerData?.is_online || false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  const { data: availabilities = [] } = usePractitionerAvailability(practitionerId);
  const { data: exceptions = [] } = usePractitionerExceptions(practitionerId);
  const deleteAvailability = useDeleteAvailability();
  const deleteException = useDeleteException();

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

  return (
    <div className="space-y-6">
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
              <CardTitle>Planning hebdomadaire</CardTitle>
              <CardDescription>Créneaux répétitifs par jour de la semaine</CardDescription>
            </div>
            <AddAvailabilityDialog practitionerId={practitionerId} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DAYS_FR.map((day, index) => {
              const dayAvailabilities = availabilities.filter(a => a.day_of_week === index);
              return (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{day}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {dayAvailabilities.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Non disponible</span>
                    ) : (
                      dayAvailabilities.map((avail) => (
                        <div key={avail.id} className="flex items-center gap-1">
                          <Badge variant="outline">
                            {avail.start_time.substring(0, 5)} - {avail.end_time.substring(0, 5)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await deleteAvailability.mutateAsync(avail.id);
                                toast({ title: 'Créneau supprimé' });
                              } catch (error) {
                                toast({ title: 'Erreur', variant: 'destructive' });
                              }
                            }}
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
              <CardTitle>Exceptions et congés</CardTitle>
              <CardDescription>Jours fériés, congés et indisponibilités</CardDescription>
            </div>
            <Button size="sm" variant="outline">
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
              />
            </div>
            <div className="space-y-3">
              <h4 className="font-medium">Exceptions à venir</h4>
              {exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune exception programmée</p>
              ) : (
                <div className="space-y-2">
                  {exceptions.map((exception) => (
                    <div key={exception.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {exception.is_available ? 'Disponibilité' : 'Indisponibilité'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(exception.date).toLocaleDateString('fr-FR')}
                          </p>
                          {exception.reason && (
                            <p className="text-xs text-muted-foreground mt-1">{exception.reason}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await deleteException.mutateAsync(exception.id);
                              toast({ title: 'Exception supprimée' });
                            } catch (error) {
                              toast({ title: 'Erreur', variant: 'destructive' });
                            }
                          }}
                        >
                          Supprimer
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