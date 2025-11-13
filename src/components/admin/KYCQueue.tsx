import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, AlertCircle, FileText, Calendar, Download, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { getSignedFileUrl } from "@/lib/file-upload";
import { Skeleton } from "@/components/ui/skeleton";

interface DocumentUrls {
  id_document_url: string | null;
  license_document_url: string | null;
  insurance_document_url: string | null;
}

export function KYCQueue() {
  const queryClient = useQueryClient();
  const [selectedPractitioner, setSelectedPractitioner] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [documentUrls, setDocumentUrls] = useState<Record<string, DocumentUrls>>({});
  const [loadingUrls, setLoadingUrls] = useState<Record<string, boolean>>({});
  const [viewingDocument, setViewingDocument] = useState<{ url: string; name: string } | null>(null);

  const { data: practitioners, isLoading } = useQuery({
    queryKey: ['kyc-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .in('kyc_status', ['pending', 'incomplete'])
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  const updateKYCMutation = useMutation({
    mutationFn: async ({ id, status, comment }: { id: string; status: string; comment?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('practitioners')
        .update({
          kyc_status: status,
          kyc_comment: comment,
          kyc_reviewed_by: user?.id,
          kyc_reviewed_at: new Date().toISOString(),
          can_accept_missions: status === 'approved',
        })
        .eq('id', id);

      if (error) throw error;

      // Log audit
      await supabase.from('admin_audit_logs').insert({
        admin_id: user?.id,
        action: `KYC ${status}`,
        entity_type: 'practitioner',
        entity_id: id,
        details: { comment },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kyc-queue'] });
      toast({ title: "Statut KYC mis à jour" });
      setSelectedPractitioner(null);
      setComment("");
    },
  });

  // Load signed URLs for documents
  useEffect(() => {
    const loadDocumentUrls = async () => {
      if (!practitioners) return;

      for (const practitioner of practitioners) {
        if (documentUrls[practitioner.id]) continue;

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
          console.error("Error loading document URLs:", error);
          toast({
            title: "Erreur",
            description: "Impossible de charger les documents",
            variant: "destructive",
          });
        } finally {
          setLoadingUrls(prev => ({ ...prev, [practitioner.id]: false }));
        }
      }
    };

    loadDocumentUrls();
  }, [practitioners]);

  const getExpiryBadge = (date: string | null) => {
    if (!date) return <Badge variant="destructive">Non renseigné</Badge>;
    
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
                      </div>
                    </TableCell>
                    <TableCell>{practitioner.specialty}</TableCell>
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
                            <div className="grid gap-3 p-4 border rounded-lg">
                              <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Pièce d'identité</Label>
                                {getExpiryBadge(practitioner.id_document_expiry)}
                              </div>
                              <DocumentLink 
                                url={documentUrls[practitioner.id]?.id_document_url || null}
                                label="Pièce d'identité"
                                loading={loadingUrls[practitioner.id]}
                              />
                            </div>
                            
                            <div className="grid gap-3 p-4 border rounded-lg">
                              <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Licence professionnelle</Label>
                                {getExpiryBadge(practitioner.license_expiry)}
                              </div>
                              <div className="text-sm text-muted-foreground mb-2">
                                Numéro: {practitioner.license_number || 'Non renseigné'}
                              </div>
                              <DocumentLink 
                                url={documentUrls[practitioner.id]?.license_document_url || null}
                                label="Licence professionnelle"
                                loading={loadingUrls[practitioner.id]}
                              />
                            </div>
                            
                            <div className="grid gap-3 p-4 border rounded-lg">
                              <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Assurance RCP</Label>
                                {getExpiryBadge(practitioner.insurance_expiry)}
                              </div>
                              <DocumentLink 
                                url={documentUrls[practitioner.id]?.insurance_document_url || null}
                                label="Assurance RCP"
                                loading={loadingUrls[practitioner.id]}
                              />
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="default" onClick={() => setSelectedPractitioner(practitioner)}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approuver
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Approuver le praticien</DialogTitle>
                              <DialogDescription>
                                Confirmer la validation du dossier KYC
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
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
                                onClick={() => updateKYCMutation.mutate({
                                  id: practitioner.id,
                                  status: 'approved',
                                  comment,
                                })}
                                disabled={updateKYCMutation.isPending}
                              >
                                Confirmer l'approbation
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => setSelectedPractitioner(practitioner)}>
                              <AlertCircle className="h-4 w-4 mr-1" />
                              Incomplet
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Demander un complément</DialogTitle>
                              <DialogDescription>
                                Indiquer les documents ou informations manquantes
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
                                onClick={() => updateKYCMutation.mutate({
                                  id: practitioner.id,
                                  status: 'incomplete',
                                  comment,
                                })}
                                disabled={!comment || updateKYCMutation.isPending}
                              >
                                Envoyer la demande
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              <XCircle className="h-4 w-4 mr-1" />
                              Refuser
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Refuser le praticien</DialogTitle>
                              <DialogDescription>
                                Justifier le refus du dossier KYC
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
                                onClick={() => updateKYCMutation.mutate({
                                  id: practitioner.id,
                                  status: 'rejected',
                                  comment,
                                })}
                                disabled={!comment || updateKYCMutation.isPending}
                              >
                                Confirmer le refus
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

      {/* Document Viewer Dialog */}
      <Dialog open={!!viewingDocument} onOpenChange={(open) => !open && setViewingDocument(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{viewingDocument?.name}</DialogTitle>
            <DialogDescription>Prévisualisation du document</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center bg-muted rounded-lg overflow-hidden" style={{ minHeight: '500px' }}>
            {viewingDocument?.url && (
              <iframe
                src={viewingDocument.url}
                className="w-full h-full"
                style={{ minHeight: '500px' }}
                title={viewingDocument.name}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
