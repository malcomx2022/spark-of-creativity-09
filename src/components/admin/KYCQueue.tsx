import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Download,
  Eye,
  History,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { getSignedFileUrl } from "@/lib/file-upload";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/integrations/supabase/types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/network-timeout";

interface DocumentUrls {
  id_document_url: string | null;
  license_document_url: string | null;
  insurance_document_url: string | null;
}

interface KYCHistoryEntry {
  id: string;
  created_at: string;
  action: string;
  admin_id: string | null;
  admin_name: string | null;
  details: { comment?: string } | null;
}

export function KYCQueue() {
  const queryClient = useQueryClient();
  const [selectedPractitioner, setSelectedPractitioner] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [documentUrls, setDocumentUrls] = useState<Record<string, DocumentUrls>>({});
  const [loadingUrls, setLoadingUrls] = useState<Record<string, boolean>>({});
  const [viewingDocument, setViewingDocument] = useState<{ url: string; name: string } | null>(null);
  const [historyPractitionerId, setHistoryPractitionerId] = useState<string | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [incompleteDialogOpen, setIncompleteDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  const {
    data: practitionerHistoryEntries,
    isLoading: isHistoryLoading,
  } = useQuery({
    queryKey: ['kyc-history', historyPractitionerId],
    enabled: !!historyPractitionerId,
    queryFn: async () => {
      if (!historyPractitionerId) return [] as KYCHistoryEntry[];

      const { data, error } = await withTimeout(
        supabase
          .from('admin_audit_logs')
          .select('id, created_at, action, admin_id, details')
          .eq('entity_type', 'practitioner')
          .eq('entity_id', historyPractitionerId)
          .ilike('action', 'KYC%')
          .order('created_at', { ascending: false })
      );

      if (error) throw error;

      const adminIds = Array.from(new Set((data || []).map((log) => log.admin_id).filter(Boolean)));
      let adminMap: Record<string, string | null> = {};

      if (adminIds.length > 0) {
        const { data: profilesData, error: profilesError } = await withTimeout(
          supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', adminIds as string[])
        );

        if (profilesError) {
          if (import.meta.env.DEV) {
            console.error('Error loading admin profiles:', profilesError);
          }
        } else {
          adminMap = (profilesData || []).reduce<Record<string, string | null>>((acc, profile) => {
            acc[profile.id] = profile.full_name;
            return acc;
          }, {});
        }
      }

      return (data || []).map<KYCHistoryEntry>((entry) => ({
        ...entry,
        admin_name: entry.admin_id ? adminMap[entry.admin_id] ?? null : null,
        details:
          entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details)
            ? (entry.details as { comment?: string })
            : null,
      }));
    },
  });

  const {
    data: kycHistoryPractitioners = [],
    isLoading: isKycHistoryPractitionersLoading,
  } = useQuery<Tables<'practitioners'>[]>({
    queryKey: ['kyc-history-list'],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase
          .from('practitioners')
          .select(
            'id, name, phone, specialty, kyc_status, kyc_comment, kyc_reviewed_at, kyc_validated_at, created_at'
          )
          .order('kyc_reviewed_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
      );

      if (error) throw error;
      return (data || []) as Tables<'practitioners'>[];
    },
  });

  const {
    data: practitioners = [],
    isLoading,
  } = useQuery<Tables<'practitioners'>[]>({
    queryKey: ['kyc-queue'],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase
          .from('practitioners')
          .select('*')
          .in('kyc_status', ['pending', 'incomplete'])
          .order('created_at', { ascending: true })
      );

      if (error) throw error;
      return (data || []) as Tables<'practitioners'>[];
    },
  });

  useEffect(() => {
    const handleChange = (
      payload: RealtimePostgresChangesPayload<Tables<'practitioners'>>
    ) => {
      try {
        const relevantStatuses = ['pending', 'incomplete'];
        const newStatus = (payload.new as Tables<'practitioners'> | null)?.kyc_status ?? '';
        const oldStatus = (payload.old as Tables<'practitioners'> | null)?.kyc_status ?? '';

        const shouldInvalidate =
          (payload.eventType === 'INSERT' && relevantStatuses.includes(newStatus)) ||
          (payload.eventType === 'UPDATE' && (relevantStatuses.includes(newStatus) || relevantStatuses.includes(oldStatus))) ||
          (payload.eventType === 'DELETE' && relevantStatuses.includes(oldStatus));

        if (shouldInvalidate) {
          queryClient.invalidateQueries({ queryKey: ['kyc-queue'] });
          queryClient.invalidateQueries({ queryKey: ['kyc-history-list'] });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Realtime subscription error:', error);
        }
      }
    };

    const channel = supabase
      .channel('kyc-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'practitioners' }, handleChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateKYCMutation = useMutation({
    mutationFn: async ({ id, status, comment, expectedCurrentStatus }: { id: string; status: string; comment?: string; expectedCurrentStatus?: string }) => {
      if (import.meta.env.DEV) {
        console.log('[KYC Update] Starting mutation:', { id, status, comment, expectedCurrentStatus });
      }
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Utilisateur non authentifié');
      }

      // Protection contre les race conditions: vérifier l'état actuel avant mise à jour
      if (expectedCurrentStatus) {
        const { data: currentPractitioner, error: fetchError } = await withTimeout(
          supabase
            .from('practitioners')
            .select('kyc_status, kyc_reviewed_at')
            .eq('id', id)
            .single()
        );

        if (fetchError) {
          throw new Error('Impossible de vérifier l\'état actuel du dossier');
        }

        if (currentPractitioner.kyc_status !== expectedCurrentStatus) {
          throw new Error(
            `Le statut KYC a été modifié par un autre administrateur (statut actuel: ${currentPractitioner.kyc_status}). Veuillez rafraîchir la page.`
          );
        }
      }

      if (import.meta.env.DEV) {
        console.log('[KYC Update] Updating practitioner in database...');
      }
      const { error } = await withTimeout(
        supabase
          .from('practitioners')
          .update({
            kyc_status: status,
            kyc_comment: comment,
            kyc_reviewed_by: user.id,
            kyc_reviewed_at: new Date().toISOString(),
            can_accept_missions: status === 'approved',
            ...(status === 'approved' ? { kyc_validated_at: new Date().toISOString() } : {}),
          })
          .eq('id', id)
      );

      if (error) {
        if (import.meta.env.DEV) {
          console.error('[KYC Update] Database update error:', error);
        }
        throw error;
      }

      if (import.meta.env.DEV) {
        console.log('[KYC Update] Inserting audit log...');
      }
      const { error: auditError } = await withTimeout(
        supabase.from('admin_audit_logs').insert({
          admin_id: user.id,
          action: `KYC ${status}`,
          entity_type: 'practitioner',
          entity_id: id,
          details: { comment },
        })
      );

      if (auditError) {
        if (import.meta.env.DEV) {
          console.error('[KYC Update] Audit log error:', auditError);
        }
        // Ne pas bloquer si le log d'audit échoue
      }

      if (import.meta.env.DEV) {
        console.log('[KYC Update] Mutation completed successfully');
      }
    },
    onSuccess: async (_, variables) => {
      if (import.meta.env.DEV) {
        console.log('[KYC Update] onSuccess triggered');
      }
      queryClient.invalidateQueries({ queryKey: ['kyc-queue'] });
      queryClient.invalidateQueries({ queryKey: ['kyc-history-list'] });
      
      // Envoyer la notification appropriée selon le statut
      try {
        if (import.meta.env.DEV) {
          console.log('[KYC Update] Sending notification...');
        }
        await supabase.functions.invoke('send-kyc-status-notification', {
          body: {
            practitionerId: variables.id,
            status: variables.status,
            comment: variables.comment
          }
        });
        
        const statusMessages = {
          approved: "Le praticien a été notifié de l'activation de son compte",
          rejected: "Le praticien a été notifié du refus de son dossier",
          incomplete: "Le praticien a été notifié des éléments manquants"
        };
        
        toast({ 
          title: "Statut KYC mis à jour", 
          description: statusMessages[variables.status as keyof typeof statusMessages] || "Statut mis à jour"
        });
      } catch (notifError) {
        if (import.meta.env.DEV) {
          console.error('[KYC Update] Error sending notification:', notifError);
        }
        toast({ 
          title: "Statut KYC mis à jour", 
          description: "Statut modifié (erreur d'envoi de notification)" 
        });
      }
      
      setSelectedPractitioner(null);
      setComment("");
      setApproveDialogOpen(false);
      setIncompleteDialogOpen(false);
      setRejectDialogOpen(false);
    },
    onError: (error: Error) => {
      if (import.meta.env.DEV) {
        console.error('[KYC Update] Mutation error:', error);
      }
      toast({
        title: "Erreur",
        description: error.message || "Impossible de mettre à jour le statut KYC",
        variant: "destructive"
      });
    }
  });

  // Load signed URLs for documents (lazy loading + parallel)
  useEffect(() => {
    const loadDocumentUrls = async () => {
      if (!practitioners || practitioners.length === 0) return;

      // Ne charger que les URLs qui manquent, en parallèle
      const pendingLoads = practitioners
        .filter(p => !documentUrls[p.id])
        .map(async (practitioner) => {
          setLoadingUrls(prev => ({ ...prev, [practitioner.id]: true }));

          try {
            const [idUrl, licenseUrl, insuranceUrl] = await Promise.all([
              getSignedFileUrl(practitioner.id_document_url),
              getSignedFileUrl(practitioner.license_document_url),
              getSignedFileUrl(practitioner.insurance_document_url),
            ]);

            setDocumentUrls(prev => ({
              ...prev,
              [practitioner.id]: {
                id_document_url: idUrl,
                license_document_url: licenseUrl,
                insurance_document_url: insuranceUrl,
              },
            }));
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error(`Error loading documents for ${practitioner.id}:`, error);
            }
          } finally {
            setLoadingUrls(prev => ({ ...prev, [practitioner.id]: false }));
          }
        });

      // Exécuter tous les chargements en parallèle
      await Promise.all(pendingLoads);
    };

    loadDocumentUrls();
  }, [practitioners]);

  const getExpiryBadge = (date: string | null, isRequired: boolean = true, documentUrl?: string | null) => {
    // Si le document est uploadé mais pas de date d'expiration, montrer "Fourni"
    if (!date) {
      if (documentUrl) {
        return <Badge variant="outline" className="border-green-500">✓ Fourni</Badge>;
      }
      return isRequired 
        ? <Badge variant="destructive">Non renseigné</Badge>
        : <Badge variant="outline" className="opacity-60">Non requis</Badge>;
    }
    
    const expiry = new Date(date);
    const today = new Date();
    const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return <Badge variant="destructive">Expiré</Badge>;
    if (daysUntil < 30) return <Badge variant="outline" className="border-orange-500">Expire bientôt ({daysUntil}j)</Badge>;
    return <Badge variant="outline" className="border-green-500">Valide</Badge>;
  };

  const DocumentLink = ({ url, label, loading }: { url: string | null; label: string; loading?: boolean }) => {
    if (loading) {
      return <Skeleton className="h-8 w-32" />;
    }

    if (!url) {
      return <span className="text-muted-foreground">Non fourni</span>;
    }

    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setViewingDocument({ url, name: label })}
        >
          <Eye className="h-4 w-4 mr-1" />
          Voir
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(url, '_blank')}
        >
          <Download className="h-4 w-4 mr-1" />
          Télécharger
        </Button>
      </div>
    );
  };

  const getActionMeta = (action: string) => {
    const normalized = action.toLowerCase();

    if (normalized.includes('approved')) {
      return {
        label: 'Approuvé',
        badgeVariant: 'secondary' as const,
        icon: CheckCircle,
        iconClass: 'text-green-500',
      };
    }

    if (normalized.includes('rejected')) {
      return {
        label: 'Refusé',
        badgeVariant: 'destructive' as const,
        icon: XCircle,
        iconClass: 'text-red-500',
      };
    }

    if (normalized.includes('incomplete')) {
      return {
        label: 'Incomplet',
        badgeVariant: 'outline' as const,
        icon: AlertCircle,
        iconClass: 'text-orange-500',
      };
    }

    return {
      label: action,
      badgeVariant: 'outline' as const,
      icon: FileText,
      iconClass: 'text-primary',
    };
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'Date inconnue';

    return new Date(dateString).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const formatAdminLabel = (entry: KYCHistoryEntry) => {
    if (entry.admin_name) return entry.admin_name;
    if (!entry.admin_id) return 'Administrateur inconnu';
    return `ID ${entry.admin_id.slice(0, 8)}…`;
  };

  const getStatusMeta = (status: string | null) => {
    switch (status) {
      case 'approved':
        return { label: 'Approuvé', variant: 'secondary' as const };
      case 'rejected':
        return { label: 'Refusé', variant: 'destructive' as const };
      case 'incomplete':
        return { label: 'Incomplet', variant: 'outline' as const };
      case 'pending':
      default:
        return { label: 'En attente', variant: 'outline' as const };
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>File d'attente KYC</CardTitle>
          <CardDescription>
            Validation des praticiens en attente de vérification
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : practitioners && practitioners.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Praticien</TableHead>
                  <TableHead>Spécialité</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {practitioners.map((practitioner) => (
                  <TableRow key={practitioner.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{practitioner.name}</div>
                        <div className="text-sm text-muted-foreground">{practitioner.phone}</div>
                        {practitioner.practitioner_type === 'coach_sportif' && (
                          <Badge variant="outline" className="mt-1 text-xs border-blue-500 text-blue-600">
                            Coach Sportif
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span>{practitioner.specialty}</span>
                        {/* Show previous KYC comment if incomplete */}
                        {practitioner.kyc_status === 'incomplete' && practitioner.kyc_comment && (
                          <p className="text-xs text-orange-600 mt-1 italic">
                            Dernier commentaire: {practitioner.kyc_comment.length > 50
                              ? practitioner.kyc_comment.substring(0, 50) + '...'
                              : practitioner.kyc_comment}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={practitioner.kyc_status === 'pending' ? 'outline' : 'secondary'}>
                        {practitioner.kyc_status === 'pending' ? 'En attente' : 'Incomplet'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <FileText className="h-4 w-4 mr-2" />
                            Voir
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Documents - {practitioner.name}</DialogTitle>
                            <DialogDescription>Vérification des pièces justificatives</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-6">
                            {/* Pièce d'identité - REQUIS pour TOUS */}
                            <div className="grid gap-3 p-4 border rounded-lg">
                              <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">
                                  Pièce d'identité <span className="text-destructive">*</span>
                                </Label>
                                {getExpiryBadge(practitioner.id_document_expiry, true, practitioner.id_document_url)}
                              </div>
                              <DocumentLink 
                                url={documentUrls[practitioner.id]?.id_document_url || null}
                                label="Pièce d'identité"
                                loading={loadingUrls[practitioner.id]}
                              />
                            </div>
                            
                            {/* Documents spécifiques selon le type de praticien */}
                            {practitioner.practitioner_type === 'coach_sportif' ? (
                              <>
                                {/* Pour les COACHES SPORTIFS : Diplôme/Certificat REQUIS */}
                                <div className="grid gap-3 p-4 border rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-base font-semibold">
                                      Diplôme/Certificat <span className="text-destructive">*</span>
                                    </Label>
                                    {!practitioner.insurance_document_url && !practitioner.diplomas?.length ? (
                                      <Badge variant="destructive">Non renseigné</Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-green-500">Fourni</Badge>
                                    )}
                                  </div>
                                  <DocumentLink 
                                    url={documentUrls[practitioner.id]?.insurance_document_url || null}
                                    label="Diplôme/Certificat"
                                    loading={loadingUrls[practitioner.id]}
                                  />
                                  {practitioner.diplomas && practitioner.diplomas.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-sm font-medium mb-1">Diplômes déclarés :</p>
                                      <div className="flex gap-2 flex-wrap">
                                        {/* P3: Use diploma value as key */}
                                        {practitioner.diplomas.map((diploma: string) => (
                                          <Badge key={diploma} variant="secondary">{diploma}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Informations spécifiques REQUISES pour Coach Sportif */}
                                <div className="grid gap-3 p-4 border rounded-lg bg-primary/5">
                                  <Label className="text-base font-semibold text-primary">
                                    Informations Coach Sportif (Requises)
                                  </Label>
                                  
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-sm font-medium">Types de séances proposées <span className="text-destructive">*</span></p>
                                      {!practitioner.session_types || practitioner.session_types.length === 0 ? (
                                        <Badge variant="destructive" className="text-xs">Non renseigné</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs border-green-500">✓ Renseigné</Badge>
                                      )}
                                    </div>
                                    {practitioner.session_types && practitioner.session_types.length > 0 ? (
                                      <div className="flex gap-2 flex-wrap">
                                        {practitioner.session_types.map((type: string) => (
                                          <Badge key={type} variant="secondary" className="capitalize">
                                            {type}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground italic">Aucun type de séance renseigné</p>
                                    )}
                                  </div>

                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <p className="text-sm font-medium">Zone d'intervention <span className="text-destructive">*</span></p>
                                      {!practitioner.intervention_zone ? (
                                        <Badge variant="destructive" className="text-xs">Non renseigné</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs border-green-500">✓ Renseigné</Badge>
                                      )}
                                    </div>
                                    {practitioner.intervention_zone ? (
                                      <p className="text-sm text-muted-foreground">{practitioner.intervention_zone}</p>
                                    ) : (
                                      <p className="text-sm text-muted-foreground italic">Zone non renseignée</p>
                                    )}
                                  </div>

                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <p className="text-sm font-medium">Rayon d'intervention <span className="text-destructive">*</span></p>
                                      {!practitioner.intervention_radius ? (
                                        <Badge variant="destructive" className="text-xs">Non renseigné</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs border-green-500">✓ Renseigné</Badge>
                                      )}
                                    </div>
                                    {practitioner.intervention_radius ? (
                                      <p className="text-sm text-muted-foreground">{practitioner.intervention_radius} km</p>
                                    ) : (
                                      <p className="text-sm text-muted-foreground italic">Rayon non renseigné</p>
                                    )}
                                  </div>

                                  {practitioner.certifications && practitioner.certifications.length > 0 && (
                                    <div>
                                      <p className="text-sm font-medium mb-2">Certifications (optionnel) :</p>
                                      <div className="flex gap-2 flex-wrap">
                                        {/* P3: Use cert value as key */}
                                        {practitioner.certifications.map((cert: string) => (
                                          <Badge key={cert} variant="outline">
                                            {cert}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Pour les AUTRES PRATICIENS : Licence + Assurance REQUISES */}
                                <div className="grid gap-3 p-4 border rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-base font-semibold">
                                      Autorisation d'exercice <span className="text-destructive">*</span>
                                    </Label>
                                    {getExpiryBadge(practitioner.license_expiry, true, practitioner.license_document_url)}
                                  </div>
                                  <div className="text-sm text-muted-foreground mb-2">
                                    Numéro: {practitioner.license_number || <span className="text-destructive">Non renseigné</span>}
                                  </div>
                                  <DocumentLink 
                                    url={documentUrls[practitioner.id]?.license_document_url || null}
                                    label="Autorisation d'exercice"
                                    loading={loadingUrls[practitioner.id]}
                                  />
                                </div>
                                
                                <div className="grid gap-3 p-4 border rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-base font-semibold">
                                      Assurance RCP <span className="text-destructive">*</span>
                                    </Label>
                                    {getExpiryBadge(practitioner.insurance_expiry, true, practitioner.insurance_document_url)}
                                  </div>
                                  <DocumentLink 
                                    url={documentUrls[practitioner.id]?.insurance_document_url || null}
                                    label="Assurance RCP"
                                    loading={loadingUrls[practitioner.id]}
                                  />
                                </div>

                                <div className="grid gap-3 p-4 border rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-base font-semibold">
                                      Spécialité <span className="text-destructive">*</span>
                                    </Label>
                                    {!practitioner.specialty ? (
                                      <Badge variant="destructive">Non renseigné</Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-green-500">✓ Renseigné</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {practitioner.specialty || <span className="text-destructive italic">Spécialité non renseignée</span>}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryPractitionerId(practitioner.id)}
                        >
                          <History className="h-4 w-4 mr-1" />
                          Historique
                        </Button>

                        <Dialog open={approveDialogOpen} onOpenChange={(open) => {
                          setApproveDialogOpen(open);
                          if (!open) {
                            setComment("");
                            setSelectedPractitioner(null);
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="default" 
                              onClick={() => {
                                setComment("");
                                setSelectedPractitioner(practitioner);
                                setApproveDialogOpen(true);
                              }}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approuver
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Approuver le praticien</DialogTitle>
                              <DialogDescription>
                                Confirmer la validation du dossier KYC de {selectedPractitioner?.name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              {/* Warning for expired documents */}
                              {selectedPractitioner && (() => {
                                const hasExpiredId = selectedPractitioner.id_document_expiry && new Date(selectedPractitioner.id_document_expiry) < new Date();
                                const hasExpiredLicense = selectedPractitioner.license_expiry && new Date(selectedPractitioner.license_expiry) < new Date();
                                const hasExpiredInsurance = selectedPractitioner.insurance_expiry && new Date(selectedPractitioner.insurance_expiry) < new Date();
                                const hasExpired = hasExpiredId || hasExpiredLicense || hasExpiredInsurance;

                                if (hasExpired) {
                                  return (
                                    <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
                                      <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4" />
                                        Documents expirés détectés
                                      </p>
                                      <ul className="text-sm text-destructive/80 mt-2 list-disc list-inside">
                                        {hasExpiredId && <li>Pièce d'identité expirée</li>}
                                        {hasExpiredLicense && <li>Autorisation d'exercice expirée</li>}
                                        {hasExpiredInsurance && <li>Assurance expirée</li>}
                                      </ul>
                                      <p className="text-xs text-destructive/70 mt-2">
                                        Êtes-vous sûr de vouloir approuver ce dossier ?
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              <div>
                                <Label htmlFor="approve-comment">Commentaire (optionnel)</Label>
                                <Textarea
                                  id="approve-comment"
                                  placeholder="Notes internes..."
                                  value={comment}
                                  onChange={(e) => setComment(e.target.value)}
                                />
                              </div>
                              <Button
                                className="w-full"
                                onClick={() => {
                                  if (selectedPractitioner) {
                                    updateKYCMutation.mutate({
                                      id: selectedPractitioner.id,
                                      status: 'approved',
                                      comment,
                                      expectedCurrentStatus: selectedPractitioner.kyc_status,
                                    });
                                  }
                                }}
                                disabled={updateKYCMutation.isPending}
                              >
                                {updateKYCMutation.isPending ? "Traitement..." : "Confirmer l'approbation"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={incompleteDialogOpen} onOpenChange={(open) => {
                          setIncompleteDialogOpen(open);
                          if (!open) {
                            setComment("");
                            setSelectedPractitioner(null);
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => {
                                setComment("");
                                setSelectedPractitioner(practitioner);
                                setIncompleteDialogOpen(true);
                              }}
                            >
                              <AlertCircle className="h-4 w-4 mr-1" />
                              Incomplet
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Demander un complément</DialogTitle>
                              <DialogDescription>
                                Indiquer les documents ou informations manquantes pour {selectedPractitioner?.name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="incomplete-comment">Commentaire (requis)</Label>
                                <Textarea
                                  id="incomplete-comment"
                                  placeholder="Veuillez fournir..."
                                  value={comment}
                                  onChange={(e) => setComment(e.target.value)}
                                  required
                                />
                              </div>
                              <Button
                                className="w-full"
                                onClick={() => {
                                  if (selectedPractitioner) {
                                    updateKYCMutation.mutate({
                                      id: selectedPractitioner.id,
                                      status: 'incomplete',
                                      comment,
                                      expectedCurrentStatus: selectedPractitioner.kyc_status,
                                    });
                                  }
                                }}
                                disabled={!comment || updateKYCMutation.isPending}
                              >
                                {updateKYCMutation.isPending ? "Traitement..." : "Envoyer la demande"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={rejectDialogOpen} onOpenChange={(open) => {
                          setRejectDialogOpen(open);
                          if (!open) {
                            setComment("");
                            setSelectedPractitioner(null);
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={() => {
                                setComment("");
                                setSelectedPractitioner(practitioner);
                                setRejectDialogOpen(true);
                              }}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Refuser
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Refuser le praticien</DialogTitle>
                              <DialogDescription>
                                Justifier le refus du dossier KYC de {selectedPractitioner?.name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="reject-comment">Motif (requis)</Label>
                                <Textarea
                                  id="reject-comment"
                                  placeholder="Raison du refus..."
                                  value={comment}
                                  onChange={(e) => setComment(e.target.value)}
                                  required
                                />
                              </div>
                              <Button
                                className="w-full"
                                variant="destructive"
                                onClick={() => {
                                  if (selectedPractitioner) {
                                    updateKYCMutation.mutate({
                                      id: selectedPractitioner.id,
                                      status: 'rejected',
                                      comment,
                                      expectedCurrentStatus: selectedPractitioner.kyc_status,
                                    });
                                  }
                                }}
                                disabled={!comment || updateKYCMutation.isPending}
                              >
                                {updateKYCMutation.isPending ? "Traitement..." : "Confirmer le refus"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Aucun praticien en attente de validation
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique des validations</CardTitle>
          <CardDescription>
            Consultez l'ensemble des décisions KYC prises pour les praticiens
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isKycHistoryPractitionersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : kycHistoryPractitioners && kycHistoryPractitioners.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Praticien</TableHead>
                  <TableHead>Statut KYC</TableHead>
                  <TableHead>Dernière action</TableHead>
                  <TableHead>Dernier commentaire</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kycHistoryPractitioners.map((practitioner) => {
                  const statusMeta = getStatusMeta(practitioner.kyc_status);

                  return (
                    <TableRow key={practitioner.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{practitioner.name}</div>
                          <div className="text-sm text-muted-foreground">{practitioner.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {practitioner.kyc_reviewed_at || practitioner.kyc_validated_at
                          ? formatDateTime(practitioner.kyc_reviewed_at || practitioner.kyc_validated_at)
                          : 'Aucune action enregistrée'}
                      </TableCell>
                      <TableCell>
                        {practitioner.kyc_comment ? (
                          <span className="text-sm">{practitioner.kyc_comment}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Aucun commentaire</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryPractitionerId(practitioner.id)}
                        >
                          <History className="h-4 w-4 mr-1" />
                          Historique
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Aucun historique de validation disponible
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Viewer Dialog */}
      <Dialog open={!!viewingDocument} onOpenChange={(open) => !open && setViewingDocument(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{viewingDocument?.name}</DialogTitle>
            <DialogDescription>Prévisualisation du document</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {viewingDocument?.url && (
              <>
                {viewingDocument.url.toLowerCase().split('?')[0].endsWith('.pdf') ? (
                  <div className="flex flex-col gap-2">
                    <iframe
                      src={`${viewingDocument.url}#toolbar=0`}
                      className="w-full border rounded"
                      style={{ minHeight: '70vh' }}
                      title={viewingDocument.name}
                      onError={(e) => {
                        console.error("Error loading PDF in iframe:", e);
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => window.open(viewingDocument.url, '_blank')}
                      className="w-full"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Ouvrir dans un nouvel onglet
                    </Button>
                  </div>
                ) : (
                  <img
                    src={viewingDocument.url}
                    alt={viewingDocument.name}
                    className="w-full h-auto rounded"
                    onError={(e) => {
                      console.error("Error loading image:", e);
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none';
                      const errorDiv = document.createElement('div');
                      errorDiv.className = 'text-center py-8 text-muted-foreground';
                      errorDiv.textContent = 'Impossible de charger l\'image. Essayez de la télécharger.';
                      img.parentElement?.appendChild(errorDiv);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyPractitionerId} onOpenChange={(open) => !open && setHistoryPractitionerId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique KYC</DialogTitle>
            <DialogDescription>
              Toutes les décisions prises pour ce praticien
            </DialogDescription>
          </DialogHeader>
          {isHistoryLoading ? (
            <div className="py-8 text-center text-muted-foreground">Chargement de l'historique...</div>
          ) : practitionerHistoryEntries && practitionerHistoryEntries.length > 0 ? (
            <div className="space-y-4">
              {practitionerHistoryEntries.map((entry) => {
                const meta = getActionMeta(entry.action);
                const Icon = meta.icon;

                return (
                  <div key={entry.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${meta.iconClass}`} />
                        <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Décision prise par <span className="font-medium text-foreground">{formatAdminLabel(entry)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Commentaire :</span>{' '}
                      {entry.details?.comment ? entry.details.comment : <span className="text-muted-foreground">Aucun commentaire fourni</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Aucun historique disponible pour ce praticien
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
