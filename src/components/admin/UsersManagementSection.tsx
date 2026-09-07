import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PatientDetailsDialog } from './PatientDetailsDialog';
import { PractitionerDetailsDialog } from './PractitionerDetailsDialog';

/** Lignes de GET /admin/users/patients et /admin/users/practitioners. */
interface AdminPatientRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  created_at: string;
  email: string | null;
}

interface AdminPractitionerRow {
  id: string;
  name: string;
  specialty: string;
  phone: string | null;
  kyc_status: string | null;
  can_accept_missions: boolean | null;
  rating: number | null;
  created_at: string;
}

export function UsersManagementSection() {
  const [searchInput, setSearchInput] = useState('');
  const searchTerm = useDebouncedValue(searchInput, 300);
  const [profilesPage, setProfilesPage] = useState(0);
  const [practitionersPage, setPractitionersPage] = useState(0);
  const [confirmText, setConfirmText] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedPractitionerId, setSelectedPractitionerId] = useState<string | null>(null);
  const pageSize = 50;
  const queryClient = useQueryClient();

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      // Supprime tous les comptes hors @test.com (super_admin), journalisé côté API
      return api.post<{ message: string }>('/admin/users/cleanup-non-test', { confirm: 'SUPPRIMER' }, { timeoutMs: 120_000 });
    },
    onSuccess: (data) => {
      toast({
        title: "Nettoyage réussi",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-practitioners'] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, 'Nettoyage impossible'),
        variant: "destructive",
      });
    },
  });

  const { data: profilesData, isLoading: profilesLoading } = useQuery({
    queryKey: ['admin-profiles', profilesPage, searchTerm],
    queryFn: async () => {
      // Patients = profils sans rôle admin ni fiche praticien (règle appliquée par l'API)
      const res = await api.get<{ data: AdminPatientRow[]; count: number }>('/admin/users/patients', {
        query: { page: profilesPage, limit: pageSize, ...(searchTerm ? { search: searchTerm } : {}) },
      });
      return { profiles: res.data, total: res.count };
    },
  });

  const profiles = profilesData?.profiles || [];
  const profilesTotal = profilesData?.total || 0;
  const profilesHasMore = profilesTotal > (profilesPage + 1) * pageSize;

  const { data: practitionersData, isLoading: practitionersLoading } = useQuery({
    queryKey: ['admin-practitioners', practitionersPage, searchTerm],
    queryFn: async () => {
      const res = await api.get<{ data: AdminPractitionerRow[]; count: number }>('/admin/users/practitioners', {
        query: { page: practitionersPage, limit: pageSize, ...(searchTerm ? { search: searchTerm } : {}) },
      });
      return { practitioners: res.data, total: res.count };
    },
  });

  const practitioners = practitionersData?.practitioners || [];
  const practitionersTotal = practitionersData?.total || 0;
  const practitionersHasMore = practitionersTotal > (practitionersPage + 1) * pageSize;


  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un utilisateur..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
            <div className="py-4">
              <Input
                placeholder="Tapez SUPPRIMER pour confirmer"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="font-mono"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText('')}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  cleanupMutation.mutate();
                  setConfirmText('');
                }}
                disabled={confirmText.toUpperCase() !== 'SUPPRIMER'}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
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
                {profilesTotal} patient(s) enregistré(s) • Page {profilesPage + 1}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profilesLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : profiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun patient trouvé
                </div>
              ) : (
                <>
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
                      {profiles.map((profile) => (
                        <TableRow 
                          key={profile.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedPatientId(profile.id)}
                        >
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
                  {/* P2 #2: Désactivation des boutons pendant le chargement */}
                  <div className="flex justify-between items-center mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setProfilesPage(p => Math.max(0, p - 1))}
                      disabled={profilesPage === 0 || profilesLoading}
                    >
                      {profilesLoading ? "..." : "Précédent"}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Affichage de {profilesPage * pageSize + 1} à {Math.min((profilesPage + 1) * pageSize, profilesTotal)} sur {profilesTotal}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setProfilesPage(p => p + 1)}
                      disabled={!profilesHasMore || profilesLoading}
                    >
                      {profilesLoading ? "..." : "Suivant"}
                    </Button>
                  </div>
                </>
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
                {practitionersTotal} praticien(s) enregistré(s) • Page {practitionersPage + 1}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {practitionersLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : practitioners.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun praticien trouvé
                </div>
              ) : (
                <>
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
                      {practitioners.map((practitioner) => (
                        <TableRow 
                          key={practitioner.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedPractitionerId(practitioner.id)}
                        >
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
                  {/* P2 #2: Désactivation des boutons pendant le chargement */}
                  <div className="flex justify-between items-center mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setPractitionersPage(p => Math.max(0, p - 1))}
                      disabled={practitionersPage === 0 || practitionersLoading}
                    >
                      {practitionersLoading ? "..." : "Précédent"}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Affichage de {practitionersPage * pageSize + 1} à {Math.min((practitionersPage + 1) * pageSize, practitionersTotal)} sur {practitionersTotal}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setPractitionersPage(p => p + 1)}
                      disabled={!practitionersHasMore || practitionersLoading}
                    >
                      {practitionersLoading ? "..." : "Suivant"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PatientDetailsDialog 
        patientId={selectedPatientId}
        onOpenChange={(open) => !open && setSelectedPatientId(null)}
      />

      <PractitionerDetailsDialog 
        practitionerId={selectedPractitionerId}
        onOpenChange={(open) => !open && setSelectedPractitionerId(null)}
      />
    </div>
  );
}
