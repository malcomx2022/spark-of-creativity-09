import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Shield, KeyRound } from "lucide-react";
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
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Combiner les données
      return roles.map(role => ({
        ...role,
        profile: profiles?.find(p => p.id === role.user_id)
      }));
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AdminRole }) => {
      // Note: Pour créer un admin, il faudrait une edge function
      // Pour l'instant, on ne peut qu'assigner un rôle à un utilisateur existant
      throw new Error("Fonctionnalité à implémenter via edge function");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast({ title: "Admin créé avec succès" });
      setEmail("");
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
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      toast({ title: "Rôle admin révoqué" });
    },
  });

  return (
    <div className="space-y-6">
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
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteAdminMutation.mutate(admin.id)}
                        disabled={deleteAdminMutation.isPending}
                      >
                        Révoquer
                      </Button>
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
