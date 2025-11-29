import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Shield, Settings, FileText, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

type ConsentType = 'cgu' | 'charte' | 'partage_donnees' | 'marketing';
type SystemConfigValue = string | number | boolean | object | null;

export function ComplianceSection() {
  const queryClient = useQueryClient();
  const [newConsentForm, setNewConsentForm] = useState({
    consent_type: 'cgu' as ConsentType,
    version: '',
    content: '',
  });
  const [consentsPage, setConsentsPage] = useState(1);
  const [configPage, setConfigPage] = useState(1);
  const consentsLimit = 50;
  const configLimit = 100;

  const { data: consentsData, isLoading: consentsLoading } = useQuery({
    queryKey: ['admin-consent-versions', consentsPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('consent_versions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((consentsPage - 1) * consentsLimit, consentsPage * consentsLimit - 1);

      if (error) throw error;
      return { data: data || [], total: count || 0 };
    },
  });

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['admin-system-config', configPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('system_config')
        .select('*', { count: 'exact' })
        .order('key', { ascending: true })
        .range((configPage - 1) * configLimit, configPage * configLimit - 1);

      if (error) throw error;
      return { data: data || [], total: count || 0 };
    },
  });

  const consentVersions = consentsData?.data || [];
  const systemConfig = configData?.data || [];
  const consentsTotal = consentsData?.total || 0;
  const configTotal = configData?.total || 0;

  const createConsentMutation = useMutation({
    mutationFn: async (data: typeof newConsentForm) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('consent_versions')
        .insert({
          consent_type: data.consent_type,
          version: data.version,
          content: data.content,
          is_active: false,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-consent-versions'] });
      toast({ title: 'Version de consentement créée' });
      setNewConsentForm({ consent_type: 'cgu', version: '', content: '' });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Chercher si la config existe
      const { data: existing } = await supabase
        .from('system_config')
        .select('id')
        .eq('key', key)
        .single();

      if (existing) {
        // Update existant
        const { error } = await supabase
          .from('system_config')
          .update({
            value,
            updated_by: user?.id,
          })
          .eq('key', key);
        
        if (error) throw error;
      } else {
        // Insert nouveau
        const { error } = await supabase
          .from('system_config')
          .insert({
            key,
            value,
            updated_by: user?.id,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-config'] });
      toast({ title: 'Configuration mise à jour' });
    },
  });

  const getConsentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      cgu: 'CGU',
      charte: 'Charte',
      partage_donnees: 'Partage données',
      marketing: 'Marketing',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="consents">
        <TabsList>
          <TabsTrigger value="consents">Consentements</TabsTrigger>
          <TabsTrigger value="config">Configuration système</TabsTrigger>
        </TabsList>

        <TabsContent value="consents" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Versions de consentements
                  </CardTitle>
                  <CardDescription>CGU, politique de confidentialité, etc.</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Nouvelle version</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Créer une version de consentement</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="consent-type">Type</Label>
                        <Select
                          value={newConsentForm.consent_type}
                          onValueChange={(value) =>
                            setNewConsentForm({ ...newConsentForm, consent_type: value as ConsentType })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cgu">CGU</SelectItem>
                            <SelectItem value="charte">Charte</SelectItem>
                            <SelectItem value="partage_donnees">Partage données</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="version">Version</Label>
                        <Input
                          id="version"
                          placeholder="v1.0"
                          value={newConsentForm.version}
                          onChange={(e) =>
                            setNewConsentForm({ ...newConsentForm, version: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="content">Contenu</Label>
                        <Textarea
                          id="content"
                          rows={10}
                          value={newConsentForm.content}
                          onChange={(e) =>
                            setNewConsentForm({ ...newConsentForm, content: e.target.value })
                          }
                          required
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => createConsentMutation.mutate(newConsentForm)}
                        disabled={createConsentMutation.isPending}
                      >
                        {createConsentMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Création...
                          </>
                        ) : (
                          'Créer la version'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {consentsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : consentVersions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucune version de consentement
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date création</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consentVersions.map((consent) => (
                      <TableRow key={consent.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {getConsentTypeLabel(consent.consent_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{consent.version}</TableCell>
                        <TableCell>
                          <Badge variant={consent.is_active ? 'default' : 'secondary'}>
                            {consent.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {new Date(consent.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline">
                            Voir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Pagination */}
              {!consentsLoading && consentVersions.length > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Affichage {(consentsPage - 1) * consentsLimit + 1} à {Math.min(consentsPage * consentsLimit, consentsTotal)} sur {consentsTotal}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConsentsPage(p => Math.max(1, p - 1))}
                      disabled={consentsPage === 1}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConsentsPage(p => p + 1)}
                      disabled={consentsPage * consentsLimit >= consentsTotal}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuration système
              </CardTitle>
              <CardDescription>Paramètres globaux de l'application</CardDescription>
            </CardHeader>
            <CardContent>
              {configLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : (
                <div className="space-y-4">
                  {systemConfig.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Aucune configuration
                    </div>
                  ) : (
                    systemConfig.map((config) => (
                      <div key={config.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium">{config.key}</h4>
                            {config.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {config.description}
                              </p>
                            )}
                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                              {JSON.stringify(config.value, null, 2)}
                            </pre>
                          </div>
                          <Button size="sm" variant="outline">
                            Modifier
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Pagination */}
              {!configLoading && systemConfig.length > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Affichage {(configPage - 1) * configLimit + 1} à {Math.min(configPage * configLimit, configTotal)} sur {configTotal}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfigPage(p => Math.max(1, p - 1))}
                      disabled={configPage === 1}
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfigPage(p => p + 1)}
                      disabled={configPage * configLimit >= configTotal}
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
