import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TriageHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TriageHistory({ open, onOpenChange }: TriageHistoryProps) {
  const { data: user } = useSupabaseUser();

  const { data: triageResults = [], isLoading } = useQuery({
    queryKey: ['triage-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('triage_results')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && open,
  });

  const getUrgencyIcon = (level: string) => {
    switch (level) {
      case 'immediate':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'urgent':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'semi-urgent':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      default:
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
  };

  const getUrgencyBadge = (level: string) => {
    switch (level) {
      case 'immediate':
        return <Badge variant="destructive">Immédiat</Badge>;
      case 'urgent':
        return <Badge className="bg-orange-500">Urgent</Badge>;
      case 'semi-urgent':
        return <Badge className="bg-yellow-500">Semi-urgent</Badge>;
      default:
        return <Badge className="bg-green-500">Non urgent</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique des évaluations de triage</DialogTitle>
          <DialogDescription>
            Vos 20 dernières évaluations d'urgence médicale
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : triageResults.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucune évaluation enregistrée
          </div>
        ) : (
          <div className="space-y-4">
            {triageResults.map((result: any) => (
              <Card key={result.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getUrgencyIcon(result.urgency_level)}
                      <div>
                        <p className="font-medium">{result.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(result.created_at), 'PPP à HH:mm', { locale: fr })}
                        </p>
                      </div>
                    </div>
                    {getUrgencyBadge(result.urgency_level)}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Score:</span>
                      <span className="font-medium">{result.score}/25</span>
                    </div>

                    {result.recommendations && result.recommendations.length > 0 && (
                      <div>
                        <p className="text-muted-foreground mb-1">Recommandations:</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {result.recommendations.map((rec: string, idx: number) => (
                            <li key={idx}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
