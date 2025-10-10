import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calendar as CalendarIcon, Clock, Plus } from "lucide-react";

interface AvailabilitySectionProps {
  practitionerId: string;
  practitionerData: any;
}

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function AvailabilitySection({ practitionerId, practitionerData }: AvailabilitySectionProps) {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(practitionerData?.is_online || false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

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
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un créneau
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {DAYS_FR.map((day, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{day}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">09:00 - 12:00</Badge>
                  <Badge variant="outline">14:00 - 18:00</Badge>
                  <Button variant="ghost" size="sm">Modifier</Button>
                </div>
              </div>
            ))}
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
              <div className="space-y-2">
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Vacances d'été</p>
                      <p className="text-sm text-muted-foreground">15 Jul - 30 Jul 2025</p>
                    </div>
                    <Button variant="ghost" size="sm">Supprimer</Button>
                  </div>
                </div>
              </div>
              <Button className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter une exception
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}