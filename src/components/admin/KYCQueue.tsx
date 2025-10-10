import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, AlertCircle, FileText, Calendar } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

export function KYCQueue() {
  const queryClient = useQueryClient();
  const [selectedPractitioner, setSelectedPractitioner] = useState<any>(null);
  const [comment, setComment] = useState("");

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

  const getExpiryBadge = (date: string | null) => {
    if (!date) return <Badge variant="destructive">Non renseigné</Badge>;
    
    const expiry = new Date(date);
    const today = new Date();
    const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) return <Badge variant="destructive">Expiré</Badge>;
    if (daysUntil < 30) return <Badge variant="outline" className="border-orange-500">Expire bientôt ({daysUntil}j)</Badge>;
    return <Badge variant="outline" className="border-green-500">Valide</Badge>;
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
                          <Button variant="ghost" size="sm" onClick={() => setSelectedPractitioner(practitioner)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Voir
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Documents - {practitioner.name}</DialogTitle>
                            <DialogDescription>Vérification des pièces justificatives</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid gap-2">
                              <Label>Pièce d'identité</Label>
                              <div className="flex items-center gap-2">
                                {practitioner.id_document_url ? (
                                  <a href={practitioner.id_document_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                    Voir le document
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">Non fourni</span>
                                )}
                                {getExpiryBadge(practitioner.id_document_expiry)}
                              </div>
                            </div>
                            <div className="grid gap-2">
                              <Label>Licence professionnelle</Label>
                              <div className="flex items-center gap-2">
                                {practitioner.license_document_url ? (
                                  <a href={practitioner.license_document_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                    Voir le document
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">Non fourni</span>
                                )}
                                {getExpiryBadge(practitioner.license_expiry)}
                                <span className="text-sm text-muted-foreground">N° {practitioner.license_number || 'N/A'}</span>
                              </div>
                            </div>
                            <div className="grid gap-2">
                              <Label>Assurance RCP</Label>
                              <div className="flex items-center gap-2">
                                {practitioner.insurance_document_url ? (
                                  <a href={practitioner.insurance_document_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                    Voir le document
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">Non fourni</span>
                                )}
                                {getExpiryBadge(practitioner.insurance_expiry)}
                              </div>
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
    </div>
  );
}
