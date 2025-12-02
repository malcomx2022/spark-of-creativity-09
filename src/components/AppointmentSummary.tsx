import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, User, AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatAmount } from '@/lib/payment-config';
import { formatDateWithDateFns } from '@/lib/date-utils';

interface AppointmentSummaryProps {
  appointmentData: {
    practitionerName: string;
    specialty: string;
    date: string;
    time: string;
    duration: number;
    address: string;
    reason: string;
    amount: number;
    commission: number;
    gatewayFees: number;
  };
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export function AppointmentSummary({ 
  appointmentData, 
  onConfirm, 
  onCancel,
  isProcessing 
}: AppointmentSummaryProps) {
  const { 
    practitionerName, 
    specialty, 
    date, 
    time, 
    duration,
    address, 
    reason,
    amount,
    commission,
    gatewayFees
  } = appointmentData;

  const practitionerAmount = amount - commission - gatewayFees;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Récapitulatif de votre rendez-vous</h2>
        <p className="text-muted-foreground">
          Vérifiez les informations avant de procéder au paiement
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {practitionerName}
          </CardTitle>
          <CardDescription>{specialty}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {formatDateWithDateFns(date)}
              </span>
            </div>
            
            <div className="flex items-center gap-3 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{time} ({duration} minutes)</span>
            </div>
            
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span className="flex-1">{address}</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Motif de consultation</p>
            <p className="text-sm text-muted-foreground">{reason}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Détail du paiement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Consultation</span>
              <span className="font-medium">{formatAmount(practitionerAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Commission plateforme</span>
              <span className="font-medium">{formatAmount(commission)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Frais de paiement</span>
              <span className="font-medium">{formatAmount(gatewayFees)}</span>
            </div>
            
            <Separator />
            
            <div className="flex justify-between">
              <span className="font-bold">Total à payer</span>
              <span className="text-xl font-bold text-primary">{formatAmount(amount)}</span>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Information importante</AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <p>
                <strong>Montant payé à DomiCares.</strong> Le praticien sera crédité après la consultation.
              </p>
              <p className="text-xs text-muted-foreground">
                La commission de {formatAmount(commission)} permet de faire fonctionner la plateforme 
                et de vous garantir un service de qualité.
              </p>
            </AlertDescription>
          </Alert>

          <Alert variant="default" className="border-primary/20 bg-primary/5">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">Créneau réservé temporairement</AlertTitle>
            <AlertDescription className="text-sm">
              Ce créneau sera bloqué pour vous pendant 15 minutes. 
              Veuillez compléter le paiement pour confirmer votre rendez-vous.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isProcessing}
        >
          Annuler
        </Button>
        <Button
          className="flex-1"
          onClick={onConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? 'Traitement...' : 'Procéder au paiement'}
        </Button>
      </div>
    </div>
  );
}
