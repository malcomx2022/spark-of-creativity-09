import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Phone, Trash2, RefreshCw } from 'lucide-react';
import { useOTPAttempts, useBlockedNumbers, useResetOTPAttempts, useDeleteOTPAttempt } from '@/hooks/useOTPManagement';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export function OTPManagementSection() {
  const { data: attempts = [], isLoading: attemptsLoading } = useOTPAttempts();
  const { data: blockedNumbers = [], isLoading: blockedLoading } = useBlockedNumbers();
  const resetAttempts = useResetOTPAttempts();
  const deleteAttempt = useDeleteOTPAttempt();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500">En attente</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500">Échoué</Badge>;
      case 'delivered':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500">Délivré</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getChannelBadge = (channel: string) => {
    const colors = {
      sms: 'bg-primary/10 text-primary',
      whatsapp: 'bg-green-500/10 text-green-600',
      call: 'bg-orange-500/10 text-orange-600',
    };
    return (
      <Badge variant="outline" className={colors[channel as keyof typeof colors] || ''}>
        {channel.toUpperCase()}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Gestion des OTP</h2>
        <p className="text-muted-foreground">
          Gérez les tentatives d'envoi d'OTP et débloquez les utilisateurs
        </p>
      </div>

      <Tabs defaultValue="blocked" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="blocked">
            Numéros bloqués
            {blockedNumbers.length > 0 && (
              <Badge className="ml-2" variant="destructive">
                {blockedNumbers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Historique des tentatives</TabsTrigger>
        </TabsList>

        <TabsContent value="blocked" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <CardTitle>Numéros potentiellement bloqués</CardTitle>
              </div>
              <CardDescription>
                Numéros ayant 3+ tentatives OTP dans la dernière heure
              </CardDescription>
            </CardHeader>
            <CardContent>
              {blockedLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement...
                </div>
              ) : blockedNumbers.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Aucun numéro bloqué pour le moment
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numéro de téléphone</TableHead>
                      <TableHead>Tentatives</TableHead>
                      <TableHead>Dernière tentative</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedNumbers.map((entry) => (
                      <TableRow key={entry.phone_number}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {entry.phone_number}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">{entry.attempts}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(entry.last_attempt)}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resetAttempts.isPending}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Débloquer
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Débloquer le numéro</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Êtes-vous sûr de vouloir réinitialiser les tentatives OTP pour{' '}
                                  <strong>{entry.phone_number}</strong> ?
                                  <br />
                                  <br />
                                  Cela supprimera toutes les tentatives enregistrées et permettra
                                  à l'utilisateur de recevoir un nouveau code OTP.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => resetAttempts.mutate(entry.phone_number)}
                                >
                                  Confirmer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des tentatives OTP</CardTitle>
              <CardDescription>
                Les 100 dernières tentatives d'envoi d'OTP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {attemptsLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement...
                </div>
              ) : attempts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune tentative enregistrée
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Numéro</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Erreur</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attempts.map((attempt) => (
                        <TableRow key={attempt.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(attempt.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {attempt.phone_number}
                          </TableCell>
                          <TableCell>{getChannelBadge(attempt.channel)}</TableCell>
                          <TableCell>{getStatusBadge(attempt.status)}</TableCell>
                          <TableCell className="max-w-xs">
                            {attempt.error_message && (
                              <span className="text-xs text-red-500 truncate block">
                                {attempt.error_message}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={deleteAttempt.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Supprimer la tentative</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Êtes-vous sûr de vouloir supprimer cette tentative ?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteAttempt.mutate(attempt.id)}
                                  >
                                    Supprimer
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
