import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Settings, Key, RefreshCw, AlertCircle, CheckCircle2, Activity, Clock, History, Wifi, WifiOff, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Entrée d'historique du mode FedaPay, reconstituée depuis le journal d'audit de la clé system_config fedapay_mode. */
interface ModeHistoryEntry {
  id: string;
  created_at: string;
  action: "update_fedapay_mode" | "create_fedapay_mode";
  admin: { full_name: string | null; email: string | null };
  details: { previous_mode?: string; new_mode?: string; mode?: string };
}

export function ApiManagementSection() {
  const queryClient = useQueryClient();
  const [selectedMode, setSelectedMode] = useState<string>("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  // Dialog states
  const [fedapayDialogOpen, setFedapayDialogOpen] = useState(false);
  const [twilioDialogOpen, setTwilioDialogOpen] = useState(false);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [mapboxDialogOpen, setMapboxDialogOpen] = useState(false);

  // Récupérer la configuration actuelle avec date de modification
  const { data: currentConfig, isLoading, refetch } = useQuery({
    queryKey: ["api-config"],
    queryFn: async () => {
      const rows = await api.get<Array<{ key: string; value: unknown; updated_at: string | null }>>("/admin/system-config");
      const row = rows.find((r) => r.key === "fedapay_mode");
      return {
        mode: (row?.value as { mode?: string } | null)?.mode || "sandbox",
        updatedAt: row?.updated_at ?? undefined,
      };
    },
  });

  // Historique des changements de mode (depuis audit logs)
  const { data: modeHistory = [] } = useQuery({
    queryKey: ["api-mode-history"],
    queryFn: async () => {
      // Journal d'audit de la clé fedapay_mode (GET /admin/audit-logs), remis dans la forme attendue par l'historique
      const res = await api.get<{ data: Array<{ id: string; action: string; created_at: string; admin_name: string | null; details: { value?: { mode?: string }; previous?: { mode?: string } } | null }> }>("/admin/audit-logs", {
        query: { entityType: "system_config", entityId: "fedapay_mode", limit: 20 },
      });
      return res.data.map((entry): ModeHistoryEntry => ({
        id: entry.id,
        created_at: entry.created_at,
        action: entry.action === "update_system_config" ? "update_fedapay_mode" : "create_fedapay_mode",
        admin: { full_name: entry.admin_name, email: null },
        details: { previous_mode: entry.details?.previous?.mode, new_mode: entry.details?.value?.mode, mode: entry.details?.value?.mode },
      }));
    },
  });

  // Statistiques d'utilisation des API (webhooks, OTP, etc.)
  const { data: apiStats } = useQuery({
    queryKey: ["api-usage-stats"],
    queryFn: async () => {
      // Volumes webhooks / OTP / documents calculés par l'API (GET /admin/api/usage)
      return api.get<{ fedapay: { total: number; today: number; successRate: number }; twilio: { total: number; today: number; successRate: number }; storage: { documents: number } }>("/admin/api/usage");
    },
  });

  // Mutation pour mettre à jour le mode avec audit log
  const updateModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      // Journal d'audit (ancien et nouveau mode) tenu par l'API
      await api.put("/admin/system-config/fedapay_mode", { value: { mode }, description: "Mode de fonctionnement de FedaPay (sandbox ou live)" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-config"] });
      queryClient.invalidateQueries({ queryKey: ["api-mode-history"] });
      toast.success("Mode FedaPay mis à jour avec succès");
    },
    onError: (error) => {
      if (import.meta.env.DEV) {
        console.error("Error updating FedaPay mode:", error);
      }
      toast.error("Erreur lors de la mise à jour du mode");
    },
  });

  const handleUpdateMode = () => {
    if (selectedMode && selectedMode !== currentConfig?.mode) {
      setConfirmDialogOpen(true);
    }
  };

  const confirmUpdateMode = () => {
    if (selectedMode) {
      updateModeMutation.mutate(selectedMode);
      setConfirmDialogOpen(false);
    }
  };

  const currentMode = currentConfig?.mode || "sandbox";

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
        <p>Chargement de la configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Gestion des API</CardTitle>
                <CardDescription>
                  Configuration des clés API et modes de fonctionnement
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualiser
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Statistiques d'utilisation des API */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">FedaPay</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apiStats?.fedapay.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              webhooks ({apiStats?.fedapay.successRate || 0}% succès)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Twilio</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apiStats?.twilio.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              OTP envoyés ({apiStats?.twilio.successRate || 0}% délivrés)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stockage</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{apiStats?.storage?.documents || 0}</div>
            <p className="text-xs text-muted-foreground">
              documents stockés
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aujourd'hui</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(apiStats?.fedapay.today || 0) + (apiStats?.twilio.today || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              requêtes API
            </p>
          </CardContent>
        </Card>
      </div>

      {/* FedaPay Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Configuration FedaPay</CardTitle>
                <CardDescription>
                  Gérer le mode de paiement (sandbox ou production)
                  {currentConfig?.updatedAt && (
                    <span className="block text-xs mt-1">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Dernière modification: {formatDate(currentConfig.updatedAt)}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryDialogOpen(true)}
              >
                <History className="h-4 w-4 mr-2" />
                Historique
              </Button>
              <Badge variant={currentMode === "live" ? "default" : "secondary"}>
                {currentMode === "live" ? "Production" : "Sandbox"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {currentMode === "live" ? (
                <span className="font-medium text-destructive">
                  Mode Production actif : Les transactions sont réelles et facturées.
                </span>
              ) : (
                <span>
                  Mode Sandbox actif : Les transactions sont simulées pour les tests.
                </span>
              )}
            </AlertDescription>
          </Alert>

          <Separator />

          <div className="space-y-4">
            <Label className="text-base font-semibold">Sélectionner le mode</Label>
            <RadioGroup
              value={selectedMode || currentMode}
              onValueChange={setSelectedMode}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/5 transition-colors">
                <RadioGroupItem value="sandbox" id="sandbox" />
                <Label
                  htmlFor="sandbox"
                  className="flex-1 cursor-pointer font-normal"
                >
                  <div className="font-semibold">Sandbox (Test)</div>
                  <div className="text-sm text-muted-foreground">
                    Mode de test avec transactions simulées
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent/5 transition-colors">
                <RadioGroupItem value="live" id="live" />
                <Label
                  htmlFor="live"
                  className="flex-1 cursor-pointer font-normal"
                >
                  <div className="font-semibold">Production (Live)</div>
                  <div className="text-sm text-muted-foreground">
                    Mode production avec transactions réelles
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {selectedMode && selectedMode !== currentMode && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-400">
                Vous êtes sur le point de passer en mode <strong>{selectedMode === "live" ? "Production" : "Sandbox"}</strong>.
                {selectedMode === "live" && (
                  <span className="block mt-1 font-medium">
                    ⚠️ Les transactions seront réelles et facturées.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleUpdateMode}
              disabled={!selectedMode || selectedMode === currentMode || updateModeMutation.isPending}
              className="flex-1"
            >
              {updateModeMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Mise à jour...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Appliquer les changements
                </>
              )}
            </Button>
            {selectedMode && selectedMode !== currentMode && (
              <Button
                variant="outline"
                onClick={() => setSelectedMode(currentMode)}
              >
                Annuler
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Keys Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clés API FedaPay</CardTitle>
          <CardDescription>
            Les clés API sont stockées de manière sécurisée dans les secrets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Key className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Secrets configurés :</p>
                <ul className="text-sm space-y-1 ml-4 list-disc">
                  <li>FEDAPAY_MODE - Mode actuel</li>
                  <li>FEDAPAY_PUBLIC_KEY - Clé publique</li>
                  <li>FEDAPAY_SECRET_KEY - Clé secrète</li>
                  <li>FEDAPAY_WEBHOOK_SECRET - Secret webhook</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  Pour modifier les clés API, contactez un super administrateur ou utilisez
                  la gestion des secrets dans les paramètres du projet.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Other APIs Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Autres API</CardTitle>
          <CardDescription>
            Configuration des autres services externes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {(apiStats?.twilio.successRate || 0) > 50 ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <p className="font-medium">Twilio (SMS/OTP)</p>
                  <p className="text-sm text-muted-foreground">
                    {apiStats?.twilio.total || 0} OTP envoyés • {apiStats?.twilio.successRate || 0}% délivrés
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge
                  variant="outline"
                  className={
                    (apiStats?.twilio.successRate || 0) > 50
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }
                >
                  {(apiStats?.twilio.successRate || 0) > 50 ? "Opérationnel" : "Dégradé"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTwilioDialogOpen(true)}
                >
                  Gérer
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Wifi className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">Stockage objet (MinIO / S3)</p>
                  <p className="text-sm text-muted-foreground">
                    {apiStats?.storage?.documents || 0} documents stockés
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Opérationnel
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStorageDialogOpen(true)}
                >
                  Gérer
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <Wifi className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">Mapbox (Cartographie)</p>
                  <p className="text-sm text-muted-foreground">Service de cartes interactives</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Opérationnel
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMapboxDialogOpen(true)}
                >
                  Gérer
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {(apiStats?.fedapay.successRate || 0) > 50 ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-amber-500" />
                )}
                <div>
                  <p className="font-medium">FedaPay (Paiements)</p>
                  <p className="text-sm text-muted-foreground">
                    {apiStats?.fedapay.total || 0} webhooks • {apiStats?.fedapay.successRate || 0}% succès
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge
                  variant="outline"
                  className={
                    (apiStats?.fedapay.successRate || 0) > 50
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }
                >
                  {(apiStats?.fedapay.successRate || 0) > 50 ? "Opérationnel" : "Dégradé"}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFedapayDialogOpen(true)}
                >
                  Gérer
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FedaPay Keys Dialog */}
      <Dialog open={fedapayDialogOpen} onOpenChange={setFedapayDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gérer les clés API FedaPay</DialogTitle>
            <DialogDescription>
              Mettez à jour les clés API pour les modes Sandbox et Production.
              Les clés seront stockées de manière sécurisée dans les secrets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pour mettre à jour les clés FedaPay, veuillez utiliser l'outil de gestion des secrets
                dans les paramètres du projet ou contacter un administrateur.
              </AlertDescription>
            </Alert>
            <div className="space-y-3">
              <p className="text-sm font-medium">Secrets à configurer :</p>
              <ul className="text-sm space-y-2 ml-4 list-disc">
                <li><code className="bg-muted px-1">FEDAPAY_PUBLIC_KEY</code> - Clé publique</li>
                <li><code className="bg-muted px-1">FEDAPAY_SECRET_KEY</code> - Clé secrète</li>
                <li><code className="bg-muted px-1">FEDAPAY_WEBHOOK_SECRET</code> - Secret webhook</li>
                <li><code className="bg-muted px-1">FEDAPAY_MODE</code> - Mode (sandbox/live)</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Twilio Keys Dialog */}
      <Dialog open={twilioDialogOpen} onOpenChange={setTwilioDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gérer les clés API Twilio</DialogTitle>
            <DialogDescription>
              Mettez à jour les identifiants Twilio pour le service SMS/OTP.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pour mettre à jour les clés Twilio, veuillez utiliser l'outil de gestion des secrets
                dans les paramètres du projet ou contacter un administrateur.
              </AlertDescription>
            </Alert>
            <div className="space-y-3">
              <p className="text-sm font-medium">Secrets à configurer :</p>
              <ul className="text-sm space-y-2 ml-4 list-disc">
                <li><code className="bg-muted px-1">TWILIO_ACCOUNT_SID</code> - Account SID</li>
                <li><code className="bg-muted px-1">TWILIO_AUTH_TOKEN</code> - Auth Token</li>
                <li><code className="bg-muted px-1">TWILIO_PHONE_NUMBER</code> - Numéro de téléphone</li>
                <li><code className="bg-muted px-1">TWILIO_VERIFY_SERVICE_SID</code> - Service SID de vérification</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Storage Info Dialog */}
      <Dialog open={storageDialogOpen} onOpenChange={setStorageDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stockage des fichiers</DialogTitle>
            <DialogDescription>
              Les documents sont stockés dans un espace S3 compatible (MinIO sur le VPS), servis par des URL signées à durée limitée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Le stockage est géré nativement par la plateforme. Aucune configuration externe n'est nécessaire.
              </AlertDescription>
            </Alert>
            <div className="space-y-3">
              <p className="text-sm font-medium">Buckets configurés :</p>
              <ul className="text-sm space-y-2 ml-4 list-disc">
                <li><code className="bg-muted px-1">documents</code> - Documents KYC des praticiens</li>
                <li><code className="bg-muted px-1">avatars</code> - Photos de profil</li>
                <li><code className="bg-muted px-1">message-attachments</code> - Pièces jointes des messages</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Mode Change */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le changement de mode</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir passer en mode <strong>{selectedMode === "live" ? "Production" : "Sandbox"}</strong> ? 
              {selectedMode === "live" && (
                <span className="block mt-2 font-medium text-destructive">
                  ⚠️ Cette action affectera tous les paiements. Les transactions seront réelles et facturées.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpdateMode}>
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mapbox Token Dialog */}
      <Dialog open={mapboxDialogOpen} onOpenChange={setMapboxDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gérer le token Mapbox</DialogTitle>
            <DialogDescription>
              Mettez à jour le token d'accès Mapbox pour le service de cartographie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pour mettre à jour le token Mapbox, veuillez utiliser l'outil de gestion des secrets
                dans les paramètres du projet ou contacter un administrateur.
              </AlertDescription>
            </Alert>
            <div className="space-y-3">
              <p className="text-sm font-medium">Secret à configurer :</p>
              <ul className="text-sm space-y-2 ml-4 list-disc">
                <li><code className="bg-muted px-1">VITE_MAPBOX_TOKEN</code> - Token d'accès Mapbox</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Historique des changements de mode FedaPay</DialogTitle>
            <DialogDescription>
              Les 20 dernières modifications du mode de paiement
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {modeHistory.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                Aucun changement enregistré
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Détails</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modeHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(entry.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.admin?.full_name || entry.admin?.email || "Inconnu"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {entry.action === "update_fedapay_mode" ? "Modification" : "Création"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.details?.previous_mode && (
                          <span>
                            {entry.details.previous_mode === "sandbox" ? "Sandbox" : "Production"}
                            {" → "}
                          </span>
                        )}
                        <span className="font-medium">
                          {(entry.details?.new_mode || entry.details?.mode) === "sandbox"
                            ? "Sandbox"
                            : "Production"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
