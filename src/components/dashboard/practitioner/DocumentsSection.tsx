import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Eye, Upload, CheckCircle2, AlertCircle, Loader2, RefreshCw, HelpCircle, Filter, FolderCheck, FolderX, Clock } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { getSignedFileUrl, uploadUserDocument } from "@/lib/file-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface DocumentsSectionProps {
  practitionerData: any;
}

interface DocumentUrls {
  id_document_url: string | null;
  license_document_url: string | null;
  insurance_document_url: string | null;
  image: string | null;
}

export function DocumentsSection({ practitionerData }: DocumentsSectionProps) {
  const queryClient = useQueryClient();
  const [documentUrls, setDocumentUrls] = useState<DocumentUrls>({
    id_document_url: null,
    license_document_url: null,
    insurance_document_url: null,
    image: null,
  });
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<{ url: string; name: string } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Document type descriptions for tooltips
  const documentDescriptions: Record<string, string> = {
    'image': 'Photo professionnelle de bonne qualité pour votre profil public',
    'id_document_url': 'Carte d\'identité, passeport ou titre de séjour en cours de validité',
    'license_document_url': 'Document officiel autorisant l\'exercice de votre profession',
    'insurance_document_url': 'Diplôme, certification ou attestation de formation',
  };

  // Load document URLs function (reusable for refresh)
  const loadDocumentUrls = async (showRefreshing = false) => {
    if (!practitionerData) return;

    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setLoadingUrls(true);
    }

    const urls: DocumentUrls = {
      id_document_url: null,
      license_document_url: null,
      insurance_document_url: null,
      image: null,
    };

    try {
      // Charger les URLs des documents
      if (practitionerData.id_document_url) {
        const signedUrl = await getSignedFileUrl(practitionerData.id_document_url);
        urls.id_document_url = signedUrl;
      }

      if (practitionerData.license_document_url) {
        const signedUrl = await getSignedFileUrl(practitionerData.license_document_url);
        urls.license_document_url = signedUrl;
      }

      if (practitionerData.insurance_document_url) {
        const signedUrl = await getSignedFileUrl(practitionerData.insurance_document_url);
        urls.insurance_document_url = signedUrl;
      }

      if (practitionerData.image) {
        // Si c'est un chemin Wasabi (pas une URL complète), obtenir l'URL signée
        if (practitionerData.image.startsWith('http')) {
          urls.image = practitionerData.image;
        } else {
          const signedUrl = await getSignedFileUrl(practitionerData.image);
          urls.image = signedUrl;
        }
      }

      setDocumentUrls(urls);
    } catch (error) {
      console.error('Erreur chargement URLs documents:', error);
    } finally {
      setLoadingUrls(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDocumentUrls();
  }, [practitionerData]);

  // Handle refresh
  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['practitioner'] });
    await loadDocumentUrls(true);
  };

  // Format date for display
  const formatUpdateDate = (date: string | null) => {
    if (!date) return null;
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr });
    } catch {
      return null;
    }
  };

  const formatFullDate = (date: string | null) => {
    if (!date) return '';
    try {
      return format(new Date(date), 'dd MMMM yyyy à HH:mm', { locale: fr });
    } catch {
      return '';
    }
  };

  // Handler for document upload
  const handleDocumentUpload = async (file: File, documentType: string) => {
    if (!practitionerData?.user_id) {
      toast({
        title: "Erreur",
        description: "Impossible de téléverser le document. Données utilisateur manquantes.",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Type de fichier non supporté",
        description: "Veuillez téléverser un fichier PDF, JPG ou PNG.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Fichier trop volumineux",
        description: "La taille maximale autorisée est de 5 Mo.",
        variant: "destructive",
      });
      return;
    }

    setUploadingDocument(documentType);

    try {
      const result = await uploadUserDocument({
        file,
        folder: "practitioner-documents",
        userId: practitionerData.user_id,
      });

      // Map document type to database column
      const columnMap: Record<string, string> = {
        'id_document_url': 'id_document_url',
        'license_document_url': 'license_document_url',
        'insurance_document_url': 'insurance_document_url',
        'image': 'image',
      };

      const column = columnMap[documentType];
      if (!column) {
        throw new Error("Type de document invalide");
      }

      // Update practitioner record
      const { error: updateError } = await supabase
        .from('practitioners')
        .update({ [column]: result.path })
        .eq('id', practitionerData.id);

      if (updateError) {
        throw updateError;
      }

      // Update local state with new signed URL
      const signedUrl = await getSignedFileUrl(result.path);
      setDocumentUrls(prev => ({
        ...prev,
        [documentType]: signedUrl,
      }));

      // Invalidate practitioner query to refresh data
      queryClient.invalidateQueries({ queryKey: ['practitioner'] });

      toast({
        title: "Document téléversé",
        description: "Le document a été mis à jour avec succès.",
      });
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast({
        title: "Erreur de téléversement",
        description: error.message || "Impossible de téléverser le document.",
        variant: "destructive",
      });
    } finally {
      setUploadingDocument(null);
      setUploadDialogOpen(false);
      setSelectedDocumentType(null);
    }
  };

  // Handler to resubmit KYC for review
  const handleResubmitKYC = async () => {
    if (!practitionerData?.id) return;

    setIsSubmitting(true);

    try {
      // Update KYC status back to pending
      const { error } = await supabase
        .from('practitioners')
        .update({
          kyc_status: 'pending',
          kyc_comment: null, // Clear previous comment
        })
        .eq('id', practitionerData.id);

      if (error) throw error;

      // Notify admins about resubmission
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get admin users
        const { data: adminUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['super_admin', 'ops', 'finance', 'compliance', 'support', 'analyst']);

        if (adminUsers && adminUsers.length > 0) {
          const uniqueAdminIds = Array.from(new Set(adminUsers.map(a => a.user_id)));
          await supabase.from('notifications').insert(
            uniqueAdminIds.map(adminId => ({
              user_id: adminId,
              title: 'Dossier KYC re-soumis',
              message: `Le praticien ${practitionerData.name} a complété son dossier et l'a re-soumis pour validation.`,
              type: 'kyc_pending',
              link: '/admin?tab=kyc',
            }))
          );
        }
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['practitioner'] });

      toast({
        title: "Dossier soumis",
        description: "Votre dossier a été re-soumis pour validation. Vous serez notifié par email et SMS.",
      });
    } catch (error: any) {
      console.error('Error resubmitting KYC:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de soumettre le dossier.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const documents = [
    {
      key: 'image',
      label: 'Photo de profil',
      url: documentUrls.image,
      icon: <FileText className="h-4 w-4" />,
      description: documentDescriptions['image'],
    },
    {
      key: 'id_document_url',
      label: 'Pièce d\'identité',
      url: documentUrls.id_document_url,
      icon: <FileText className="h-4 w-4" />,
      description: documentDescriptions['id_document_url'],
    },
    {
      key: 'license_document_url',
      label: 'Autorisation d\'exercice',
      url: documentUrls.license_document_url,
      icon: <FileText className="h-4 w-4" />,
      description: documentDescriptions['license_document_url'],
    },
    {
      key: 'insurance_document_url',
      label: 'Diplôme/Certificat',
      url: documentUrls.insurance_document_url,
      icon: <FileText className="h-4 w-4" />,
      description: documentDescriptions['insurance_document_url'],
    },
  ];

  // Calculate statistics
  const stats = useMemo(() => {
    const total = documents.length;
    const uploaded = documents.filter(d => d.url).length;
    const missing = total - uploaded;
    const percentage = Math.round((uploaded / total) * 100);
    return { total, uploaded, missing, percentage };
  }, [documents]);

  // Filter documents based on status filter
  const filteredDocuments = useMemo(() => {
    if (statusFilter === 'all') return documents;
    if (statusFilter === 'uploaded') return documents.filter(d => d.url);
    if (statusFilter === 'missing') return documents.filter(d => !d.url);
    return documents;
  }, [documents, statusFilter]);

  const getKycStatusBadge = () => {
    const status = practitionerData?.kyc_status;
    
    if (status === 'approved') {
      return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Validé</Badge>;
    }
    if (status === 'rejected') {
      return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Refusé</Badge>;
    }
    if (status === 'incomplete') {
      return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" />Incomplet</Badge>;
    }
    return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />En attente</Badge>;
  };

  // Skeleton loading state
  if (loadingUrls && !practitionerData) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border rounded-lg p-4 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents KYC
                  <Badge variant="secondary" className="ml-2">
                    {stats.uploaded}/{stats.total}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Documents requis pour valider votre profil professionnel et exercer sur la plateforme</p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <CardDescription>
                  Vos documents d'identité et certifications
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {getKycStatusBadge()}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing || loadingUrls}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Statistics Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <FileText className="h-3.5 w-3.5" />
                  Total
                </div>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300 text-xs mb-1">
                  <FolderCheck className="h-3.5 w-3.5" />
                  Fournis
                </div>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.uploaded}</p>
              </div>
              <div className="border rounded-lg p-4 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300 text-xs mb-1">
                  <FolderX className="h-3.5 w-3.5" />
                  Manquants
                </div>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.missing}</p>
              </div>
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Clock className="h-3.5 w-3.5" />
                  Mise à jour
                </div>
                {practitionerData?.updated_at ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-sm font-medium cursor-help truncate">
                        {formatUpdateDate(practitionerData.updated_at)}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{formatFullDate(practitionerData.updated_at)}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progression</span>
                <span className="font-medium">{stats.percentage}%</span>
              </div>
              <Progress value={stats.percentage} className="h-2" />
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filtrer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous ({stats.total})</SelectItem>
                  <SelectItem value="uploaded">Fournis ({stats.uploaded})</SelectItem>
                  <SelectItem value="missing">Manquants ({stats.missing})</SelectItem>
                </SelectContent>
              </Select>
              {statusFilter !== 'all' && (
                <Badge variant="secondary">
                  {filteredDocuments.length} résultat(s)
                </Badge>
              )}
            </div>
          {practitionerData?.kyc_status === 'pending' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Vos documents sont en cours de vérification. Vous serez notifié par email et SMS une fois la validation effectuée (24-48h).
              </p>
            </div>
          )}

          {practitionerData?.kyc_status === 'incomplete' && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Documents incomplets
              </p>
              {practitionerData?.kyc_comment && (
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {practitionerData.kyc_comment}
                </p>
              )}
              <p className="text-sm text-orange-600 dark:text-orange-400">
                Mettez à jour vos documents ci-dessous puis cliquez sur "Soumettre pour validation".
              </p>
            </div>
          )}

          {practitionerData?.kyc_status === 'rejected' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Dossier refusé
              </p>
              {practitionerData?.kyc_comment && (
                <p className="text-sm text-red-700 dark:text-red-300">
                  {practitionerData.kyc_comment}
                </p>
              )}
              <p className="text-sm text-red-600 dark:text-red-400">
                Contactez le support pour plus d'informations : support@domicares.life
              </p>
            </div>
          )}

          {practitionerData?.kyc_status === 'approved' && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200">
                <CheckCircle2 className="h-4 w-4 inline mr-2" />
                Votre dossier KYC a été validé. Vous pouvez maintenant accepter des consultations.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDocuments.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Aucun document trouvé avec ce filtre</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setStatusFilter('all')}
                >
                  Réinitialiser le filtre
                </Button>
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <div
                  key={doc.key}
                  className={`border rounded-lg p-4 space-y-2 transition-all hover:shadow-sm ${
                    doc.url
                      ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                      : 'hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {doc.icon}
                      <span className="font-medium text-sm">{doc.label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{doc.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {doc.url ? (
                      <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Fourni
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Manquant
                      </Badge>
                    )}
                  </div>

                  {loadingUrls ? (
                    <Skeleton className="h-8 w-full" />
                  ) : doc.url ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewingDocument({ url: doc.url!, name: doc.label })}
                        className="flex-1"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Voir
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(doc.url!, '_blank')}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Télécharger</p>
                        </TooltipContent>
                      </Tooltip>
                      {/* Show update button only if KYC is incomplete or rejected */}
                      {(practitionerData?.kyc_status === 'incomplete' || practitionerData?.kyc_status === 'rejected') && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSelectedDocumentType(doc.key);
                                setUploadDialogOpen(true);
                              }}
                              disabled={uploadingDocument === doc.key}
                            >
                              {uploadingDocument === doc.key ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Remplacer</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <p className="text-xs text-muted-foreground flex-1">Document non fourni</p>
                      {/* Show upload button if KYC is incomplete or rejected */}
                      {(practitionerData?.kyc_status === 'incomplete' || practitionerData?.kyc_status === 'rejected') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedDocumentType(doc.key);
                            setUploadDialogOpen(true);
                          }}
                          disabled={uploadingDocument === doc.key}
                        >
                          {uploadingDocument === doc.key ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Upload className="h-3 w-3 mr-1" />
                              Téléverser
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Bouton de re-soumission pour les dossiers incomplets */}
          {practitionerData?.kyc_status === 'incomplete' && (
            <div className="border-t pt-4">
              <Button
                onClick={handleResubmitKYC}
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Soumission en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Soumettre pour validation
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Informations coach sportif */}
          {practitionerData?.practitioner_type === 'coach_sportif' && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-semibold text-sm">Informations Coach Sportif</h4>
              
              {practitionerData.session_types && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Types de séances :</p>
                  <div className="flex gap-2 flex-wrap">
                    {practitionerData.session_types.map((type: string) => (
                      <Badge key={type} variant="secondary" className="capitalize">
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {practitionerData.intervention_zone && (
                <div>
                  <p className="text-xs text-muted-foreground">Zone d'intervention :</p>
                  <p className="text-sm font-medium">{practitionerData.intervention_zone}</p>
                </div>
              )}

              {practitionerData.intervention_radius && (
                <div>
                  <p className="text-xs text-muted-foreground">Rayon d'intervention :</p>
                  <p className="text-sm font-medium">{practitionerData.intervention_radius} km</p>
                </div>
              )}

              {practitionerData.certifications && practitionerData.certifications.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Certifications :</p>
                  <div className="flex gap-2 flex-wrap">
                    {practitionerData.certifications.map((cert: string) => (
                      <Badge key={cert} variant="outline">
                        {cert}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de visualisation de document */}
      <Dialog open={!!viewingDocument} onOpenChange={() => setViewingDocument(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{viewingDocument?.name}</DialogTitle>
          </DialogHeader>
          {viewingDocument && (
            <div className="mt-4">
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog d'upload de document */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setUploadDialogOpen(false);
          setSelectedDocumentType(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Téléverser un document</DialogTitle>
            <DialogDescription>
              {selectedDocumentType && documents.find(d => d.key === selectedDocumentType)?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="document-upload">Fichier (PDF, JPG, PNG - max 5 Mo)</Label>
              <Input
                id="document-upload"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                ref={fileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && selectedDocumentType) {
                    handleDocumentUpload(file, selectedDocumentType);
                  }
                }}
                disabled={!!uploadingDocument}
                className="mt-2"
              />
            </div>
            {uploadingDocument && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Téléversement en cours...
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                setSelectedDocumentType(null);
              }}
              className="w-full"
              disabled={!!uploadingDocument}
            >
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </>
    </TooltipProvider>
  );
}
