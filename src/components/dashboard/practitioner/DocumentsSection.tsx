import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Eye, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { getSignedFileUrl } from "@/lib/file-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [documentUrls, setDocumentUrls] = useState<DocumentUrls>({
    id_document_url: null,
    license_document_url: null,
    insurance_document_url: null,
    image: null,
  });
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [viewingDocument, setViewingDocument] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    const loadDocumentUrls = async () => {
      if (!practitionerData) return;

      setLoadingUrls(true);
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
      }
    };

    loadDocumentUrls();
  }, [practitionerData]);

  const documents = [
    {
      key: 'image',
      label: 'Photo de profil',
      url: documentUrls.image,
      icon: <FileText className="h-4 w-4" />,
    },
    {
      key: 'id_document_url',
      label: 'Pièce d\'identité',
      url: documentUrls.id_document_url,
      icon: <FileText className="h-4 w-4" />,
    },
    {
      key: 'license_document_url',
      label: 'Autorisation d\'exercice',
      url: documentUrls.license_document_url,
      icon: <FileText className="h-4 w-4" />,
    },
    {
      key: 'insurance_document_url',
      label: 'Diplôme/Certificat',
      url: documentUrls.insurance_document_url,
      icon: <FileText className="h-4 w-4" />,
    },
  ];

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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documents KYC
              </CardTitle>
              <CardDescription>
                Vos documents d'identité et certifications
              </CardDescription>
            </div>
            {getKycStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {practitionerData?.kyc_status === 'pending' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Vos documents sont en cours de vérification. Vous serez notifié par email et SMS une fois la validation effectuée (24-48h).
              </p>
            </div>
          )}

          {practitionerData?.kyc_status === 'rejected' && practitionerData?.kyc_comment && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Dossier refusé
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                {practitionerData.kyc_comment}
              </p>
            </div>
          )}

          {practitionerData?.kyc_status === 'incomplete' && practitionerData?.kyc_comment && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-2">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Documents incomplets
              </p>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                {practitionerData.kyc_comment}
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
            {documents.map((doc) => (
              <div
                key={doc.key}
                className="border rounded-lg p-4 space-y-2 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {doc.icon}
                    <span className="font-medium text-sm">{doc.label}</span>
                  </div>
                  {doc.url ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Upload className="h-4 w-4 text-muted-foreground" />
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(doc.url!, '_blank')}
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Non fourni</p>
                )}
              </div>
            ))}
          </div>

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
                    {practitionerData.certifications.map((cert: string, index: number) => (
                      <Badge key={index} variant="outline">
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
    </>
  );
}
