import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Stethoscope, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export function UsersManagementSection() {
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cleanup-non-test-accounts');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Nettoyage réussi",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-practitioners'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      // Récupérer tous les profils
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;
      if (!allProfiles) return [];

      // Récupérer les IDs des utilisateurs avec un rôle admin
      const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id');

      if (rolesError) throw rolesError;
      
      const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

      // Filtrer les profils pour exclure les admins
      return allProfiles.filter(profile => !adminUserIds.has(profile.id));
    },
  });

  const { data: practitioners = [], isLoading: practitionersLoading } = useQuery({
    queryKey: ['admin-practitioners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const filteredProfiles = profiles.filter(
    (p) =>
      !searchTerm ||
      p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone?.includes(searchTerm)
  );

  const filteredPractitioners = practitioners.filter(
    (p) =>
      !searchTerm ||
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone?.includes(searchTerm) ||
      p.specialty?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un utilisateur..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="shrink-0">
              <Trash2 className="h-4 w-4 mr-2" />
              Nettoyer les comptes non-test
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action supprimera tous les comptes patients et praticiens qui n'ont pas @test.com dans leur email.
                Les comptes de test seront préservés. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => cleanupMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs defaultValue="patients">
        <TabsList>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="practitioners">Praticiens</TabsTrigger>
        </TabsList>

        <TabsContent value="patients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Liste des patients
              </CardTitle>
              <CardDescription>
                {filteredProfiles.length} patient(s) enregistré(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profilesLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : filteredProfiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun patient trouvé
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Sexe</TableHead>
                      <TableHead>Date de naissance</TableHead>
                      <TableHead>Inscrit le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">
                          {profile.full_name || 'N/A'}
                        </TableCell>
                        <TableCell>{profile.phone || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{profile.gender || 'N/A'}</Badge>
                        </TableCell>
                        <TableCell>
                          {profile.date_of_birth
                            ? new Date(profile.date_of_birth).toLocaleDateString('fr-FR')
                            : 'N/A'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Date(profile.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="practitioners" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Liste des praticiens
              </CardTitle>
              <CardDescription>
                {filteredPractitioners.length} praticien(s) enregistré(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {practitionersLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : filteredPractitioners.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun praticien trouvé
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Spécialité</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>KYC</TableHead>
                      <TableHead>Missions</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Inscrit le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPractitioners.map((practitioner) => (
                      <TableRow key={practitioner.id}>
                        <TableCell className="font-medium">{practitioner.name}</TableCell>
                        <TableCell>{practitioner.specialty}</TableCell>
                        <TableCell>{practitioner.phone || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              practitioner.kyc_status === 'approved'
                                ? 'default'
                                : practitioner.kyc_status === 'rejected'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {practitioner.kyc_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={practitioner.can_accept_missions ? 'default' : 'outline'}
                          >
                            {practitioner.can_accept_missions ? 'Actif' : 'Inactif'}
                          </Badge>
                        </TableCell>
                        <TableCell className="flex items-center gap-1">
                          {practitioner.rating || 0}
                          <span className="text-yellow-400">★</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Date(practitioner.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
