import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, Users, Loader2, CheckCircle, Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { RegisterSessionDialog } from "./RegisterSessionDialog";
import { api, auth } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

// Traductions des statuts
const STATUS_LABELS: Record<string, string> = {
  planifiee: 'Planifiée',
  confirmee: 'Confirmée',
  annulee: 'Annulée',
  terminee: 'Terminée',
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  individuelle: 'Individuelle',
  duo: 'Duo',
  groupe: 'Groupe',
};

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(true);
  // ✅ Bug #3 FIX: État pour les participants payés vs pending
  const [participantStats, setParticipantStats] = useState<{ paid: number; pending: number }>({ paid: 0, pending: 0 });
  // État pour copier l'adresse
  const [locationCopied, setLocationCopied] = useState(false);

  // Fonction pour copier l'adresse
  const handleCopyLocation = async () => {
    try {
      await navigator.clipboard.writeText(session.location);
      setLocationCopied(true);
      toast({ title: 'Adresse copiée', description: 'L\'adresse a été copiée dans le presse-papiers.' });
      setTimeout(() => setLocationCopied(false), 2000);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier l\'adresse.', variant: 'destructive' });
    }
  };

  // ✅ Statistiques de participants (coach) et inscription de l'utilisateur : GET /group-sessions/:id
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isCoachView && !auth.getSession()) {
        setIsCheckingRegistration(false);
        return;
      }
      try {
        const detail = await api.get<{ participants_paid?: number; participants_pending?: number; my_registration?: { id: string; payment_status: string | null } | null }>(`/group-sessions/${session.id}`);
        if (cancelled) return;
        if (isCoachView) {
          setParticipantStats({ paid: detail.participants_paid ?? 0, pending: detail.participants_pending ?? 0 });
        } else {
          const status = detail.my_registration?.payment_status;
          setIsAlreadyRegistered(!!detail.my_registration && ['paid', 'confirmed', 'pending'].includes(status ?? ''));
        }
      } catch (error) {
        console.error('Erreur récupération de la séance:', error);
      } finally {
        if (!cancelled) setIsCheckingRegistration(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session.id, isCoachView, session.current_participants]);
  
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

  // Protection against negative or overbooking
  const spotsRemaining = Math.max(0, session.max_participants - session.current_participants);
  const isAlmostFull = spotsRemaining <= 2;
  const canConfirm = session.current_participants >= session.min_participants;
  const isOverbooking = session.current_participants > session.max_participants;

  // Safe color accessors with defaults
  const sessionTypeColor = sessionTypeColors[session.session_type as keyof typeof sessionTypeColors] || "bg-gray-500";
  const statusColor = statusColors[session.status as keyof typeof statusColors] || "bg-gray-500";

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setIsProcessing(true);
    try {
      await onConfirm(session.id);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancel) return;
    setIsProcessing(true);
    try {
      await onCancel(session.id);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="shadow-medical hover:shadow-glow transition-all">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-xl">{session.session_name}</CardTitle>
            <CardDescription>{session.description}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge className={sessionTypeColor}>
              {SESSION_TYPE_LABELS[session.session_type] || session.session_type}
            </Badge>
            <Badge className={statusColor}>
              {STATUS_LABELS[session.status] || session.status}
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
            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate max-w-[180px] cursor-help">{session.location}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <p>{session.location}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 flex-shrink-0"
              onClick={handleCopyLocation}
            >
              {locationCopied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-primary" />
            <span className={isAlmostFull ? "text-orange-500 font-semibold" : ""}>
              {session.current_participants}/{session.max_participants} participants
              {/* ✅ Bug #3 FIX: Afficher distinction payés/pending pour le coach */}
              {isCoachView && (participantStats.paid > 0 || participantStats.pending > 0) && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({participantStats.paid} payé{participantStats.paid > 1 ? 's' : ''}
                  {participantStats.pending > 0 && `, ${participantStats.pending} en attente`})
                </span>
              )}
            </span>
          </div>
        </div>

        {isOverbooking && (
          <Badge variant="destructive" className="w-full justify-center">
            ⚠️ Overbooking: {session.current_participants - session.max_participants} participants en trop
          </Badge>
        )}

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
                      onClick={handleConfirm}
                      disabled={isProcessing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Confirmation...
                        </>
                      ) : (
                        "Confirmer"
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit?.(session.id)}
                    disabled={isProcessing}
                  >
                    Modifier
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Annulation...
                      </>
                    ) : (
                      "Annuler"
                    )}
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
              {isCheckingRegistration ? (
                <Button variant="outline" disabled>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Vérification...
                </Button>
              ) : isAlreadyRegistered ? (
                <Button variant="outline" disabled className="bg-green-50 border-green-500 text-green-700">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Déjà inscrit
                </Button>
              ) : (
                <Button 
                  variant="patient" 
                  disabled={spotsRemaining === 0 || (session.status !== "confirmee" && session.status !== "planifiee")}
                  onClick={() => setRegisterDialogOpen(true)}
                >
                  {spotsRemaining === 0 ? "Complet" : "Réserver ma place"}
                </Button>
              )}
              
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
