import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { usePaymentAttempts, PaymentAttempt } from '@/hooks/usePaymentAttempts';
import { formatAmount } from '@/lib/payment-config';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface PaymentAttemptsHistoryProps {
  appointmentId: string;
}

export function PaymentAttemptsHistory({ appointmentId }: PaymentAttemptsHistoryProps) {
  const { data: attempts, isLoading } = usePaymentAttempts(appointmentId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Historique des tentatives</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!attempts || attempts.length === 0) {
    return null;
  }

  const getStatusIcon = (status: PaymentAttempt['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'timeout':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'pending':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: PaymentAttempt['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-success">Réussi</Badge>;
      case 'failed':
        return <Badge variant="destructive">Échoué</Badge>;
      case 'timeout':
        return <Badge variant="secondary">Expiré</Badge>;
      case 'pending':
        return <Badge variant="outline">En cours</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Historique des tentatives de paiement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {attempts.map((attempt) => (
          <div
            key={attempt.id}
            className="flex flex-col gap-2 p-3 rounded-lg border bg-card"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(attempt.status)}
                <span className="text-sm font-medium">
                  Tentative #{attempt.attempt_number}
                </span>
                {getStatusBadge(attempt.status)}
              </div>
              <span className="text-xs text-muted-foreground">
                {format(new Date(attempt.created_at), 'PPp', { locale: fr })}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Montant: <span className="font-medium text-foreground">{formatAmount(attempt.amount, 'XOF')}</span>
              </span>
              <Badge variant="outline" className="text-xs">
                {attempt.payment_method.toUpperCase()}
              </Badge>
            </div>

            {attempt.error_message && (
              <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {attempt.error_message}
                </AlertDescription>
              </Alert>
            )}

            {attempt.error_type && (
              <div className="text-xs text-muted-foreground">
                Type d'erreur: {attempt.error_type}
              </div>
            )}

            {attempt.completed_at && (
              <div className="text-xs text-muted-foreground">
                Complété le {format(new Date(attempt.completed_at), 'PPp', { locale: fr })}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
