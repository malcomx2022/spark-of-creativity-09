import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Shield, Settings, FileText, Loader2, RefreshCw, Filter, Eye, Power, PowerOff, Users, CheckCircle, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useState, useMemo } from 'react';

type ConsentType = 'cgu' | 'charte' | 'partage_donnees' | 'marketing';
type SystemConfigValue = string | number | boolean | object | null;

const CONSENT_TYPE_LABELS: Record<ConsentType, string> = {
  cgu: 'CGU',
  charte: 'Charte',
  partage_donnees: 'Partage données',
  marketing: 'Marketing',
};

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

  // Filtres
  const [consentTypeFilter, setConsentTypeFilter] = useState<string>('all');

  // Dialogs
  const [viewingConsent, setViewingConsent] = useState<any>(null);
  const [consentToActivate, setConsentToActivate] = useState<any>(null);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [configValue, setConfigValue] = useState<string>('');
  const [showCreateConsentDialog, setShowCreateConsentDialog] = useState(false);

  // Stats des consentements utilisateurs
  const { data: consentStats } = useQuery({
    queryKey: ['admin-consent-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_consents')
        .select('consent_type, is_accepted');

      if (error) throw error;

      const stats: Record<string, { total: number; accepted: number }> = {};
      (data || []).forEach((consent: any) => {
        if (!stats[consent.consent_type]) {
          stats[consent.consent_type] = { total: 0, accepted: 0 };
        }
        stats[consent.consent_type].total++;
        if (consent.is_accepted) {
          stats[consent.consent_type].accepted++;
        }
      });

      return stats;
    },
  });

  const { data: consentsData, isLoading: consentsLoading, refetch: refetchConsents } = useQuery({
    queryKey: ['admin-consent-versions', consentsPage, consentTypeFilter],
    queryFn: async () => {
      let query = supabase
        .from('consent_versions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (consentTypeFilter !== 'all') {
        query = query.eq('consent_type', consentTypeFilter);
      }

      const { data, error, count } = await query
        .range((consentsPage - 1) * consentsLimit, consentsPage * consentsLimit - 1);

      if (error) throw error;
      return { data: data || [], total: count || 0 };
    },
  });

  const { data: configData, isLoading: configLoading, refetch: refetchConfig } = useQuery({
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

      if (!data.version.trim() || !data.content.trim()) {
        throw new Error('Version et contenu sont requis');
      }

      const { error } = await supabase
        .from('consent_versions')
        .insert({
          consent_type: data.consent_type,
          version: data.version,
          content: data.content,
          is_active: false,
          created_by: user?.id,
        });

      if (error) throw error;

      // Audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: 'create_consent_version',
          entity_type: 'consent_version',
          details: { consent_type: data.consent_type, version: data.version },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-consent-versions'] });
      toast({ title: 'Version de consentement créée' });
      setNewConsentForm({ consent_type: 'cgu', version: '', content: '' });
      setShowCreateConsentDialog(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  const activateConsentMutation = useMutation({
    mutationFn: async ({ id, consent_type, activate }: { id: string; consent_type: string; activate: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();

      if (activate) {
        // Désactiver toutes les autres versions du même type
        await supabase
          .from('consent_versions')
          .update({ is_active: false })
          .eq('consent_type', consent_type);
      }

      // Activer/désactiver la version sélectionnée
      const { error } = await supabase
        .from('consent_versions')
        .update({
          is_active: activate,
          effective_date: activate ? new Date().toISOString() : null,
        })
        .eq('id', id);

      if (error) throw error;

      // Audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: activate ? 'activate_consent_version' : 'deactivate_consent_version',
          entity_type: 'consent_version',
          entity_id: id,
          details: { consent_type },
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-consent-versions'] });
      toast({ title: variables.activate ? 'Version activée' : 'Version désactivée' });
      setConsentToActivate(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: any; description?: string }) => {
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
            updated_at: new Date().toISOString(),
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
            description,
            updated_by: user?.id,
          });

        if (error) throw error;
      }

      // Audit log
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: existing ? 'update_system_config' : 'create_system_config',
          entity_type: 'system_config',
          details: { key, value },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-config'] });
      toast({ title: 'Configuration mise à jour' });
      setEditingConfig(null);
      setConfigValue('');
    },
    onError: (error: Error) => {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    },
  });

  const getConsentTypeLabel = (type: string) => {
    return CONSENT_TYPE_LABELS[type as ConsentType] || type;
  };

  const openEditConfig = (config: any) => {
    setEditingConfig(config);
    setConfigValue(JSON.stringify(config.value, null, 2));
  };

  const handleSaveConfig = () => {
    if (!editingConfig) return;

    try {
      const parsedValue = JSON.parse(configValue);
      updateConfigMutation.mutate({
        key: editingConfig.key,
        value: parsedValue,
        description: editingConfig.description,
      });
    } catch (e) {
      toast({ title: 'Erreur', description: 'JSON invalide', variant: 'destructive' });
    }
  };

  // Calculate consent stats summary
  const totalUsers = useMemo(() => {
    if (!consentStats) return 0;
    const cguStats = consentStats['cgu'];
    return cguStats ? cguStats.total : 0;
  }, [consentStats]);

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        {(Object.entries(CONSENT_TYPE_LABELS) as [ConsentType, string][]).map(([type, label]) => {
          const stats = consentStats?.[type] || { total: 0, accepted: 0 };
          const acceptanceRate = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0;
          return (
            <Card key={type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  {type === 'cgu' ? <FileText className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{acceptanceRate}%</div>
                <p className="text-xs text-muted-foreground">
                  {stats.accepted}/{stats.total} acceptés
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="consents">
        <TabsList>
          <TabsTrigger value="consents">Consentements</TabsTrigger>
          <TabsTrigger value="config">Configuration système</TabsTrigger>
        </TabsList>

        <TabsContent value="consents" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Versions de consentements
                  </CardTitle>
                  <CardDescription>CGU, politique de confidentialité, etc.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={consentTypeFilter} onValueChange={(v) => { setConsentTypeFilter(v); setConsentsPage(1); }}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les types</SelectItem>
                        {(Object.entries(CONSENT_TYPE_LABELS) as [ConsentType, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => refetchConsents()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => setShowCreateConsentDialog(true)}>
                    Nouvelle version
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {consentsLoading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : consentVersions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {consentTypeFilter !== 'all' ? 'Aucune version pour ce type' : 'Aucune version de consentement'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date création</TableHead>
                      <TableHead>Date activation</TableHead>
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
                        <TableCell className="whitespace-nowrap">
                          {consent.effective_date
                            ? new Date(consent.effective_date).toLocaleDateString('fr-FR')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setViewingConsent(consent)}
                              title="Voir le contenu"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConsentToActivate(consent)}
                              title={consent.is_active ? 'Désactiver' : 'Activer'}
                              className={consent.is_active ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}
                            >
                              {consent.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                            </Button>
                          </div>
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Configuration système
                  </CardTitle>
                  <CardDescription>Paramètres globaux de l'application</CardDescription>
                </div>
                <Button variant="outline" size="icon" onClick={() => refetchConfig()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
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
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium font-mono">{config.key}</h4>
                            {config.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {config.description}
                              </p>
                            )}
                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                              {JSON.stringify(config.value, null, 2)}
                            </pre>
                            {config.updated_at && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Modifié le {new Date(config.updated_at).toLocaleString('fr-FR')}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditConfig(config)}
                          >
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

      {/* Dialog pour créer une version de consentement */}
      <Dialog open={showCreateConsentDialog} onOpenChange={setShowCreateConsentDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Créer une version de consentement</DialogTitle>
            <DialogDescription>
              Créez une nouvelle version qui pourra être activée par la suite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="consent-type">Type *</Label>
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
                  {(Object.entries(CONSENT_TYPE_LABELS) as [ConsentType, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="version">Version *</Label>
              <Input
                id="version"
                placeholder="v1.0, v2.0, etc."
                value={newConsentForm.version}
                onChange={(e) =>
                  setNewConsentForm({ ...newConsentForm, version: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="content">Contenu *</Label>
              <Textarea
                id="content"
                rows={10}
                placeholder="Texte complet du consentement..."
                value={newConsentForm.content}
                onChange={(e) =>
                  setNewConsentForm({ ...newConsentForm, content: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateConsentDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => createConsentMutation.mutate(newConsentForm)}
              disabled={createConsentMutation.isPending || !newConsentForm.version.trim() || !newConsentForm.content.trim()}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pour voir le contenu d'un consentement */}
      <Dialog open={!!viewingConsent} onOpenChange={(open) => !open && setViewingConsent(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline">{getConsentTypeLabel(viewingConsent?.consent_type)}</Badge>
              <span>{viewingConsent?.version}</span>
              {viewingConsent?.is_active && <Badge>Active</Badge>}
            </DialogTitle>
            <DialogDescription>
              Créé le {viewingConsent && new Date(viewingConsent.created_at).toLocaleDateString('fr-FR')}
              {viewingConsent?.effective_date && ` • Activé le ${new Date(viewingConsent.effective_date).toLocaleDateString('fr-FR')}`}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] p-4 bg-muted rounded-lg">
            <pre className="whitespace-pre-wrap text-sm">{viewingConsent?.content}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingConsent(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation d'activation/désactivation */}
      <AlertDialog open={!!consentToActivate} onOpenChange={(open) => !open && setConsentToActivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {consentToActivate?.is_active ? 'Désactiver cette version ?' : 'Activer cette version ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {consentToActivate?.is_active ? (
                <>
                  Vous êtes sur le point de désactiver la version <strong>{consentToActivate?.version}</strong> de <strong>{getConsentTypeLabel(consentToActivate?.consent_type)}</strong>.
                  Les utilisateurs ne verront plus cette version.
                </>
              ) : (
                <>
                  Vous êtes sur le point d'activer la version <strong>{consentToActivate?.version}</strong> de <strong>{getConsentTypeLabel(consentToActivate?.consent_type)}</strong>.
                  <br /><br />
                  <strong>Attention:</strong> Ceci désactivera automatiquement toute autre version active de ce type de consentement.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => consentToActivate && activateConsentMutation.mutate({
                id: consentToActivate.id,
                consent_type: consentToActivate.consent_type,
                activate: !consentToActivate.is_active,
              })}
              disabled={activateConsentMutation.isPending}
              className={consentToActivate?.is_active ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {activateConsentMutation.isPending
                ? 'Traitement...'
                : consentToActivate?.is_active ? 'Désactiver' : 'Activer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog pour modifier une configuration */}
      <Dialog open={!!editingConfig} onOpenChange={(open) => !open && setEditingConfig(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier la configuration</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{editingConfig?.key}</span>
              {editingConfig?.description && (
                <span className="block mt-1">{editingConfig.description}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="config-value">Valeur (JSON)</Label>
              <Textarea
                id="config-value"
                rows={8}
                className="font-mono text-sm"
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Entrez une valeur JSON valide (string, number, boolean, object, array)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfig(null)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={updateConfigMutation.isPending}
            >
              {updateConfigMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
