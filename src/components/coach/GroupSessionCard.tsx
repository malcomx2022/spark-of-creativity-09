import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { RegisterSessionDialog } from "./RegisterSessionDialog";

interface GroupSessionCardProps {
  session: {
    id: string;
    session_name: string;
    session_type: string;
    max_participants: number;
    min_participants: number;
    current_participants: number;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    price_per_person: number;
    location: string;
    status: string;
    description?: string;
  };
  onEdit?: (sessionId: string) => void;
  onCancel?: (sessionId: string) => void;
  onConfirm?: (sessionId: string) => void;
  isCoachView?: boolean;
}

export function GroupSessionCard({ session, onEdit, onCancel, onConfirm, isCoachView = false }: GroupSessionCardProps) {
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  
  const statusColors = {
    planifiee: "bg-blue-500",
    confirmee: "bg-green-500",
    annulee: "bg-red-500",
    terminee: "bg-gray-500"
  };

  const sessionTypeColors = {
    individuelle: "bg-primary",
    duo: "bg-secondary",
    groupe: "bg-accent"
  };

  const spotsRemaining = session.max_participants - session.current_participants;
  const isAlmostFull = spotsRemaining <= 2;
  const canConfirm = session.current_participants >= session.min_participants;

  return (
    <Card className="shadow-medical hover:shadow-glow transition-all">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-xl">{session.session_name}</CardTitle>
            <CardDescription>{session.description}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge className={sessionTypeColors[session.session_type as keyof typeof sessionTypeColors]}>
              {session.session_type}
            </Badge>
            <Badge className={statusColors[session.status as keyof typeof statusColors]}>
              {session.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary" />
            <span>{format(new Date(session.scheduled_date), "dd MMMM yyyy", { locale: fr })}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            <span>{session.start_time} - {session.end_time}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="truncate">{session.location}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-primary" />
            <span className={isAlmostFull ? "text-orange-500 font-semibold" : ""}>
              {session.current_participants}/{session.max_participants} participants
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div>
            <p className="text-2xl font-bold text-primary">
              {session.price_per_person.toLocaleString()} FCFA
            </p>
            <p className="text-xs text-muted-foreground">par personne</p>
          </div>

          {isCoachView ? (
            <div className="flex gap-2 flex-wrap">
              {session.status === "planifiee" && (
                <>
                  {canConfirm && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onConfirm?.(session.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Confirmer
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit?.(session.id)}
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onCancel?.(session.id)}
                  >
                    Annuler
                  </Button>
                </>
              )}
              {!canConfirm && session.status === "planifiee" && (
                <Badge variant="outline" className="text-orange-500">
                  Min {session.min_participants} participants requis
                </Badge>
              )}
              {session.status === "confirmee" && (
                <Badge className="bg-green-600">
                  Séance confirmée
                </Badge>
              )}
            </div>
          ) : (
            <>
              <Button 
                variant="patient" 
                disabled={spotsRemaining === 0 || (session.status !== "confirmee" && session.status !== "planifiee")}
                onClick={() => setRegisterDialogOpen(true)}
              >
                {spotsRemaining === 0 ? "Complet" : "Réserver ma place"}
              </Button>
              
              <RegisterSessionDialog
                open={registerDialogOpen}
                onOpenChange={setRegisterDialogOpen}
                session={session}
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}