import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings, Key, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

export function ApiManagementSection() {
  const queryClient = useQueryClient();
  const [selectedMode, setSelectedMode] = useState<string>("");
  
  // Dialog states
  const [fedapayDialogOpen, setFedapayDialogOpen] = useState(false);
  const [twilioDialogOpen, setTwilioDialogOpen] = useState(false);
  const [wasabiDialogOpen, setWasabiDialogOpen] = useState(false);
  const [mapboxDialogOpen, setMapboxDialogOpen] = useState(false);

  // Récupérer la configuration actuelle
  const { data: currentConfig, isLoading } = useQuery({
    queryKey: ["api-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_config")
        .select("*")
        .eq("key", "fedapay_mode")
        .maybeSingle();

      if (error) throw error;
      return data?.value as { mode: string } | null;
    },
  });

  // Mutation pour mettre à jour le mode
  const updateModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const { data: existingConfig } = await supabase
        .from("system_config")
        .select("id")
        .eq("key", "fedapay_mode")
        .maybeSingle();

      if (existingConfig) {
        const { error } = await supabase
          .from("system_config")
          .update({
            value: { mode },
            updated_at: new Date().toISOString(),
          })
          .eq("key", "fedapay_mode");

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("system_config")
          .insert({
            key: "fedapay_mode",
            value: { mode },
            description: "Mode de fonctionnement de FedaPay (sandbox ou live)",
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-config"] });
      toast.success("Mode FedaPay mis à jour avec succès");
    },
    onError: (error) => {
      console.error("Error updating FedaPay mode:", error);
      toast.error("Erreur lors de la mise à jour du mode");
    },
  });

  const handleUpdateMode = () => {
    if (selectedMode && selectedMode !== currentConfig?.mode) {
      updateModeMutation.mutate(selectedMode);
    }
  };

  const currentMode = currentConfig?.mode || "sandbox";

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
        </CardHeader>
      </Card>

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
                </CardDescription>
              </div>
            </div>
            <Badge variant={currentMode === "live" ? "default" : "secondary"}>
              {currentMode === "live" ? "Production" : "Sandbox"}
            </Badge>
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
              <div>
                <p className="font-medium">Twilio (SMS/OTP)</p>
                <p className="text-sm text-muted-foreground">Service de messages</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Configuré
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
              <div>
                <p className="font-medium">Wasabi (Stockage)</p>
                <p className="text-sm text-muted-foreground">Stockage de fichiers</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Configuré
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setWasabiDialogOpen(true)}
                >
                  Gérer
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Mapbox (Cartographie)</p>
                <p className="text-sm text-muted-foreground">Service de cartes</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Configuré
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

      {/* Wasabi Keys Dialog */}
      <Dialog open={wasabiDialogOpen} onOpenChange={setWasabiDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gérer les clés API Wasabi</DialogTitle>
            <DialogDescription>
              Mettez à jour les identifiants Wasabi pour le stockage de fichiers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pour mettre à jour les clés Wasabi, veuillez utiliser l'outil de gestion des secrets
                dans les paramètres du projet ou contacter un administrateur.
              </AlertDescription>
            </Alert>
            <div className="space-y-3">
              <p className="text-sm font-medium">Secrets à configurer :</p>
              <ul className="text-sm space-y-2 ml-4 list-disc">
                <li><code className="bg-muted px-1">WASABI_ACCESS_KEY_ID</code> - Access Key ID</li>
                <li><code className="bg-muted px-1">WASABI_SECRET_ACCESS_KEY</code> - Secret Access Key</li>
                <li><code className="bg-muted px-1">WASABI_ENDPOINT</code> - Endpoint URL</li>
                <li><code className="bg-muted px-1">WASABI_REGION</code> - Région</li>
                <li><code className="bg-muted px-1">WASABI_BUCKET_NAME</code> - Nom du bucket</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
