import { useState } from "react";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Users } from "lucide-react";
import { GroupSessionCard } from "@/components/coach/GroupSessionCard";
import { CreateGroupSessionDialog } from "@/components/coach/CreateGroupSessionDialog";
import { EditGroupSessionDialog } from "@/components/coach/EditGroupSessionDialog";

interface SessionsTabProps {
  coach: any;
  sessions: any[];
  isLoadingSessions: boolean;
  onCancelSession: (sessionId: string) => void;
  onConfirmSession: (sessionId: string) => void;
}

export default function SessionsTab({
  coach,
  sessions,
  isLoadingSessions,
  onCancelSession,
  onConfirmSession,
}: SessionsTabProps) {
  const [editingSession, setEditingSession] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleEditSession = (sessionId: string) => {
    const session = sessions?.find(s => s.id === sessionId);
    if (session) {
      setEditingSession(session);
      setEditDialogOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Mes séances de groupe</h2>
          <CardDescription>Gérez et créez vos séances de coaching</CardDescription>
        </div>
        <CreateGroupSessionDialog coachId={coach.id} />
      </div>

      {isLoadingSessions ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement des séances...</p>
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sessions.map((session) => (
            <GroupSessionCard
              key={session.id}
              session={session}
              isCoachView
              onEdit={handleEditSession}
              onCancel={onCancelSession}
              onConfirm={onConfirmSession}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              Aucune séance créée pour le moment
            </p>
            <CreateGroupSessionDialog coachId={coach.id} />
          </CardContent>
        </Card>
      )}

      <EditGroupSessionDialog
        session={editingSession}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  );
}
