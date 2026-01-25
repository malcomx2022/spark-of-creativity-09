import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import type { AdminManagementResponse } from "@/types/edge-function-responses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Shield, KeyRound, UserX, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { AdminRole } from "@/hooks/useAdminRole";

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  ops: 'Opérations',
  finance: 'Finance',
  compliance: 'Conformité',
  support: 'Support',
  analyst: 'Analyste',
};

export function AdminManagement() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState<AdminRole>("support");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  // P2 #11: État pour le dialogue de confirmation de désactivation
  const [adminToDisable, setAdminToDisable] = useState<{ id: string; name: string } | null>(null);
  const [disableReason, setDisableReason] = useState("");

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const [rolesResult, profilesResult] = await Promise.all([
        supabase
          .from('user_roles')
          .select('id, user_id, role, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name, phone')
      ]);

      if (rolesResult.error) throw rolesResult.error;
      if (profilesResult.error) throw profilesResult.error;

      const roles = rolesResult.data || [];
      const profiles = profilesResult.data || [];

      // Combiner les données
      return roles.map(role => ({
        ...role,
        profile: profiles.find(p => p.id === role.user_id)
      }));
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async ({ email, role, fullName, phone }: { email: string; role: AdminRole; fullName: string; phone: string }) => {
      const { data, error } = await invokeEdgeFunctionWithRetry<AdminManagementResponse>('admin-management', {
        body: { action: 'create', email, role, fullName, phone }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      setTempPassword(data?.tempPassword || '');
      setShowPasswordDialog(true);
      setEmail("");
      setFullName("");
      setPhone("");
      toast({ title: "Admin créé avec succès" });
    },
    onError: (error: Error) => {
      // P2 #3: Message d'erreur avec contexte
      toast({
        title: "Erreur lors de la création",
        description: `Impossible de créer l'administrateur: ${error.message}`,
        variant: "destructive"
      });
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await invokeEdgeFunctionWithRetry<AdminManagementResponse>('admin-management', {
        body: { action: 'disable', userId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      setAdminToDisable(null);
      setDisableReason("");
      toast({ title: "Admin désactivé avec succès" });
    },
    onError: (error: Error) => {
      // P2 #3: Message d'erreur avec contexte
      toast({
        title: "Erreur lors de la désactivation",
        description: `Impossible de désactiver l'administrateur: ${error.message}`,
        variant: "destructive"
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await invokeEdgeFunctionWithRetry<AdminManagementResponse>('admin-management', {
        body: { action: 'reset_password', userId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setTempPassword(data?.newPassword || '');
      setShowPasswordDialog(true);
      toast({ title: "Mot de passe réinitialisé" });
    },
    onError: (error: Error) => {
      // P2 #3: Message d'erreur avec contexte
      toast({
        title: "Erreur lors de la réinitialisation",
        description: `Impossible de réinitialiser le mot de passe: ${error.message}`,
        variant: "destructive"
      });
    },
  });

  const copyToClipboard = async () => {
    if (tempPassword) {
      await navigator.clipboard.writeText(tempPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
      toast({ title: "Mot de passe copié" });
    }
  };

  const handleCreateAdmin = () => {
    if (!email || !selectedRole || !fullName) {
      toast({ 
        title: "Erreur", 
        description: "Email, nom complet et rôle requis",
        variant: "destructive" 
      });
      return;
    }
    createAdminMutation.mutate({ email, role: selectedRole, fullName, phone });
  };

  return (
    <div className="space-y-6">
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mot de passe temporaire</DialogTitle>
            <DialogDescription>
              Partagez ce mot de passe avec l'administrateur. Il sera demandé lors de la première connexion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* P2 #6: Amélioration accessibilité et contraste */}
            <div className="p-4 bg-muted rounded-lg font-mono text-sm flex items-center justify-between border">
              <span className="text-foreground font-medium select-all">{tempPassword}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
                aria-label={copiedPassword ? "Mot de passe copié" : "Copier le mot de passe dans le presse-papier"}
              >
                {copiedPassword ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              ⚠️ Ce mot de passe ne sera plus visible après fermeture de cette fenêtre.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Ajouter un administrateur
          </CardTitle>
          <CardDescription>
            Créer un nouveau compte admin avec un rôle spécifique
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nom complet *</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Jean Dupont"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@domicares.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+229 XX XX XX XX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Rôle *</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AdminRole)}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Sélectionner un rôle" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ROLE_LABELS) as [AdminRole, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleCreateAdmin}
              disabled={createAdminMutation.isPending}
              className="w-full"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {createAdminMutation.isPending ? "Création..." : "Créer l'administrateur"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liste des administrateurs</CardTitle>
          <CardDescription>
            Gérer les comptes administrateurs et leurs rôles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : admins && admins.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Créé le</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell>{admin.profile?.full_name || 'N/A'}</TableCell>
                    <TableCell>{admin.profile?.phone || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABELS[admin.role as AdminRole]}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(admin.created_at).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resetPasswordMutation.mutate(admin.user_id)}
                          disabled={resetPasswordMutation.isPending}
                        >
                          <KeyRound className="h-4 w-4 mr-1" />
                          Reset MDP
                        </Button>
                        {/* P2 #11: Ouvrir dialogue de confirmation au lieu de désactiver directement */}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setAdminToDisable({
                            id: admin.user_id,
                            name: admin.profile?.full_name || 'Administrateur'
                          })}
                          disabled={deleteAdminMutation.isPending}
                        >
                          <UserX className="h-4 w-4 mr-1" />
                          Désactiver
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Aucun administrateur trouvé
            </div>
          )}
        </CardContent>
      </Card>

      {/* P2 #11: Dialogue de confirmation pour désactivation admin */}
      <AlertDialog open={!!adminToDisable} onOpenChange={(open) => !open && setAdminToDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la désactivation</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de désactiver le compte de <strong>{adminToDisable?.name}</strong>.
              Cette action supprimera définitivement l'accès administrateur de cet utilisateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="disable-reason">Raison de la désactivation</Label>
            <Textarea
              id="disable-reason"
              placeholder="Indiquez la raison de cette désactivation..."
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setAdminToDisable(null);
              setDisableReason("");
            }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (adminToDisable) {
                  deleteAdminMutation.mutate(adminToDisable.id);
                }
              }}
              disabled={!disableReason.trim() || deleteAdminMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAdminMutation.isPending ? "Désactivation..." : "Confirmer la désactivation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
