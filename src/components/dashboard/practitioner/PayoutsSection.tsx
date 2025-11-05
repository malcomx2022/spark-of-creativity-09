import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Download, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PayoutsSectionProps {
  practitionerId: string;
}

export default function PayoutsSection({ practitionerId }: PayoutsSectionProps) {
  const { toast } = useToast();
  
  // Mock data - à remplacer par de vraies données
  const stats = {
    totalEarned: 125000,
    pendingAmount: 15000,
    lastPayout: 35000,
    nextPayoutDate: "15 Nov 2025",
  };

  const payouts = [
    {
      id: "1",
      period: "01 Oct - 31 Oct 2025",
      amount: 35000,
      commission: 7000,
      fees: 500,
      net: 27500,
      status: "completed",
      date: "05 Nov 2025",
    },
    {
      id: "2",
      period: "01 Sep - 30 Sep 2025",
      amount: 42000,
      commission: 8400,
      fees: 600,
      net: 33000,
      status: "completed",
      date: "05 Oct 2025",
    },
  ];

  const getStatusBadge = (status: string) => {
    const config = {
      planned: { variant: "secondary" as const, label: "Planifié" },
      sent: { variant: "outline" as const, label: "Envoyé" },
      completed: { variant: "default" as const, label: "Complété" },
      failed: { variant: "destructive" as const, label: "Échoué" },
    };
    const { variant, label } = config[status as keyof typeof config] || config.planned;
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Vue d'ensemble */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total gagné
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEarned.toLocaleString()} XOF</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              En attente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingAmount.toLocaleString()} XOF</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dernier versement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lastPayout.toLocaleString()} XOF</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prochain versement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">{stats.nextPayoutDate}</div>
          </CardContent>
        </Card>
      </div>

      {/* Méthode de versement */}
      <Card>
        <CardHeader>
          <CardTitle>Méthode de versement</CardTitle>
          <CardDescription>Configurez votre compte pour recevoir vos paiements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Mobile Money - MTN</p>
                <p className="text-sm text-muted-foreground">+229 XX XX XX XX</p>
              </div>
            </div>
            <Button 
              variant="outline"
              onClick={() => {
                toast({
                  title: "Modification du compte",
                  description: "Cette fonctionnalité sera bientôt disponible.",
                });
              }}
            >
              Modifier
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historique des versements */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Historique des versements</CardTitle>
              <CardDescription>Tous vos paiements reçus</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                toast({
                  title: "Export en cours",
                  description: "Votre historique de paiements sera téléchargé.",
                });
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Période</TableHead>
                <TableHead>Montant brut</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Frais</TableHead>
                <TableHead>Net reçu</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell className="font-medium">{payout.period}</TableCell>
                  <TableCell>{payout.amount.toLocaleString()} XOF</TableCell>
                  <TableCell className="text-red-600">-{payout.commission.toLocaleString()} XOF</TableCell>
                  <TableCell className="text-red-600">-{payout.fees.toLocaleString()} XOF</TableCell>
                  <TableCell className="font-bold text-green-600">{payout.net.toLocaleString()} XOF</TableCell>
                  <TableCell>{getStatusBadge(payout.status)}</TableCell>
                  <TableCell>{payout.date}</TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        toast({
                          title: "Téléchargement",
                          description: `Reçu pour ${payout.period} en cours de téléchargement.`,
                        });
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}