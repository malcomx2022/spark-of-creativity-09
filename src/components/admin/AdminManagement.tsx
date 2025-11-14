import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionWithRetry } from "@/lib/edge-function-retry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [selectedRole, setSelectedRole] = useState<AdminRole>("support");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, role, created_at')
        .order('created_at', { ascending: false });
      
      if (rolesError) throw rolesError;
      if (!roles) return [];

      // Récupérer les profils séparément
      const userIds = roles.map(r => r.user_id).filter(Boolean);
      let profiles: { id: string; full_name: string | null; phone: string | null }[] = [];

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);

        if (profilesError) throw profilesError;
        profiles = profilesData ?? [];
      }

      // Combiner les données
      return roles.map(role => ({
        ...role,
        profile: profiles.find(p => p.id === role.user_id)
      }));
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AdminRole }) => {
      const { data, error } = await invokeEdgeFunctionWithRetry('admin-management', {
        body: { action: 'create', email, role, fullName: email.split('@')[0] }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      setTempPassword(data.tempPassword);
      setShowPasswordDialog(true);
      setEmail("");
      toast({ title: "Admin créé avec succès" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erreur", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await invokeEdgeFunctionWithRetry('admin-management', {
        body: { action: 'disable', userId }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast({ title: "Admin désactivé avec succès" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erreur", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await invokeEdgeFunctionWithRetry('admin-management', {
        body: { action: 'reset_password', userId }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setTempPassword(data.newPassword);
      setShowPasswordDialog(true);
      toast({ title: "Mot de passe réinitialisé" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erreur", 
        description: error.message,
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
            <div className="p-4 bg-muted rounded-lg font-mono text-sm flex items-center justify-between">
              <span>{tempPassword}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
              >
                {copiedPassword ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rôle</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AdminRole)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => createAdminMutation.mutate({ email, role: selectedRole })}
                disabled={!email || createAdminMutation.isPending}
                className="w-full"
              >
                <Shield className="h-4 w-4 mr-2" />
                Créer Admin
              </Button>
            </div>
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
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteAdminMutation.mutate(admin.user_id)}
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
    </div>
  );
}
