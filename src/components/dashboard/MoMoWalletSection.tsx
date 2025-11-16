import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import type { MoMoWalletResponse } from "@/types/edge-function-responses";
import { toast } from "sonner";
import { Wallet, Plus, Trash2 } from "lucide-react";

export default function MoMoWalletSection() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [alias, setAlias] = useState("");
  const [msisdn, setMsisdn] = useState("");
  const [operator, setOperator] = useState("");

  // Fetch wallets
  const { data: wallets, isLoading } = useQuery({
    queryKey: ['momo-wallets'],
    queryFn: async () => {
      const { data, error } = await invokeEdgeFunctionWithRetry<MoMoWalletResponse>('manage-momo-wallet', {
        body: { action: 'list' }
      });
      if (error) throw error;
      return data?.wallets || [];
    },
  });

  // Link wallet mutation
  const linkWallet = useMutation({
    mutationFn: async (walletData: any) => {
      const { data, error } = await invokeEdgeFunctionWithRetry('manage-momo-wallet', {
        body: { action: 'link', ...walletData }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['momo-wallets'] });
      toast.success("Portefeuille MoMo ajouté avec succès");
      setIsOpen(false);
      setAlias("");
      setMsisdn("");
      setOperator("");
    },
    onError: (error: Error) => {
      toast.error("Erreur lors de l'ajout du portefeuille: " + error.message);
    },
  });

  // Unlink wallet mutation
  const unlinkWallet = useMutation({
    mutationFn: async (walletId: string) => {
      const { data, error } = await invokeEdgeFunctionWithRetry('manage-momo-wallet', {
        body: { action: 'unlink', walletId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['momo-wallets'] });
      toast.success("Portefeuille MoMo supprimé");
    },
    onError: (error: Error) => {
      toast.error("Erreur lors de la suppression: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    linkWallet.mutate({ alias, msisdn, operator });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Mes Portefeuilles Mobile Money
        </CardTitle>
        <CardDescription>
          Gérez vos moyens de paiement Mobile Money
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            <p>Chargement...</p>
          ) : wallets && wallets.length > 0 ? (
            <div className="grid gap-4">
              {wallets.map((wallet: any) => (
                <div key={wallet.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{wallet.alias}</p>
                    <p className="text-sm text-muted-foreground">{wallet.msisdn_masked}</p>
                    <p className="text-sm text-muted-foreground">{wallet.operator}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => unlinkWallet.mutate(wallet.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Aucun portefeuille enregistré</p>
          )}

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un portefeuille
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Ajouter un portefeuille MoMo</DialogTitle>
                  <DialogDescription>
                    Enregistrez un nouveau moyen de paiement Mobile Money
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="alias">Alias</Label>
                    <Input
                      id="alias"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      placeholder="Mon portefeuille MTN"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="msisdn">Numéro de téléphone</Label>
                    <Input
                      id="msisdn"
                      value={msisdn}
                      onChange={(e) => setMsisdn(e.target.value)}
                      placeholder="+229XXXXXXXX"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="operator">Opérateur</Label>
                    <Select value={operator} onValueChange={setOperator} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un opérateur" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                        <SelectItem value="moov">Moov Money</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={linkWallet.isPending}>
                    {linkWallet.isPending ? "Ajout en cours..." : "Ajouter"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
