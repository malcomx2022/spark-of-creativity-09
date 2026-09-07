import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { 
  User, Phone, MapPin, Calendar, Stethoscope, Star, 
  FileCheck, Shield, Clock, Languages, Award, Briefcase, Trash2 
} from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

/** Réponse de GET /admin/users/practitioners/:id (fiche, rendez-vous, informations de reversement, solde). */
interface AdminPractitionerDetails {
  id: string;
  user_id: string;
  name: string;
  specialty: string | null;
  practitioner_type: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  created_at: string | null;
  kyc_status: string | null;
  kyc_comment: string | null;
  kyc_validated_at: string | null;
  can_accept_missions: boolean | null;
  available: boolean | null;
  is_online: boolean | null;
  address: string | null;
  intervention_zone: string | null;
  intervention_radius: number | null;
  communes_served: string[] | null;
  years_experience: number | null;
  license_number: string | null;
  languages: string[] | null;
  diplomas: string[] | null;
  certifications: string[] | null;
  bio: string | null;
  id_document_url: string | null;
  id_document_expiry: string | null;
  license_document_url: string | null;
  license_expiry: string | null;
  insurance_document_url: string | null;
  insurance_expiry: string | null;
  appointments: {
    id: string;
    patient_name: string | null;
    status: string;
    specialty: string;
    date: string;
    time: string;
    reason: string | null;
  }[];
  payment_info: {
    payment_method: string;
    account_holder_name: string | null;
    phone_number: string | null;
    bank_name: string | null;
    is_verified: boolean | null;
  }[];
  balance: {
    balance_available: number;
    balance_pending: number;
    balance_on_hold: number;
    currency: string;
  } | null;
}

interface PractitionerDetailsDialogProps {
  practitionerId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function PractitionerDetailsDialog({ practitionerId, onOpenChange }: PractitionerDetailsDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Suppression définitive (super_admin / ops), journalisée côté API
      return api.delete(`/admin/users/${userId}`, { userType: 'practitioner', confirm: 'SUPPRIMER' });
    },
    onSuccess: () => {
      toast({
        title: "Praticien supprimé",
        description: "Le praticien a été supprimé définitivement.",
      });
      queryClient.invalidateQueries({ queryKey: ['admin-practitioners'] });
      setConfirmText('');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, 'Impossible de supprimer le praticien'),
        variant: "destructive",
      });
    },
  });

  // Fiche complète vue par l'admin (GET /admin/users/practitioners/:id)
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['admin-practitioner-details', practitionerId],
    queryFn: () => api.get<AdminPractitionerDetails>(`/admin/users/practitioners/${practitionerId}`),
    enabled: !!practitionerId,
  });
  const practitioner = details ?? null;
  const appointments = details?.appointments ?? [];
  const paymentInfo = details?.payment_info?.[0] ?? null;
  const balance = details?.balance ?? null;

  const isLoading = detailsLoading;

  const getKycBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <Dialog open={!!practitionerId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Détails du praticien
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : practitioner ? (
          <div className="space-y-6">
            {/* Informations générales */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Informations générales
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Nom:</span>
                  <p className="font-medium">{practitioner.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Spécialité:</span>
                  <p className="font-medium">{practitioner.specialty}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <p><Badge variant="outline">{practitioner.practitioner_type || 'N/A'}</Badge></p>
                </div>
                <div>
                  <span className="text-muted-foreground">Téléphone:</span>
                  <p className="font-medium">{practitioner.phone || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Note:</span>
                  <p className="font-medium flex items-center gap-1">
                    {practitioner.rating || 0}
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Inscrit le:</span>
                  <p className="font-medium">
                    {practitioner.created_at
                      ? new Date(practitioner.created_at).toLocaleDateString('fr-FR')
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Statuts */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Statuts
              </h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant={getKycBadgeVariant(practitioner.kyc_status)}>
                  KYC: {practitioner.kyc_status || 'pending'}
                </Badge>
                <Badge variant={practitioner.can_accept_missions ? 'default' : 'outline'}>
                  Missions: {practitioner.can_accept_missions ? 'Actif' : 'Inactif'}
                </Badge>
                <Badge variant={practitioner.available ? 'default' : 'outline'}>
                  Disponible: {practitioner.available ? 'Oui' : 'Non'}
                </Badge>
                <Badge variant={practitioner.is_online ? 'default' : 'outline'}>
                  En ligne: {practitioner.is_online ? 'Oui' : 'Non'}
                </Badge>
              </div>
              {practitioner.kyc_validated_at && (
                <p className="text-xs text-muted-foreground">
                  KYC validé le: {new Date(practitioner.kyc_validated_at).toLocaleDateString('fr-FR')}
                </p>
              )}
              {practitioner.kyc_comment && (
                <p className="text-xs text-muted-foreground">
                  Commentaire KYC: {practitioner.kyc_comment}
                </p>
              )}
            </div>

            <Separator />

            {/* Adresse et zone d'intervention */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Localisation
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Adresse:</span>
                  <p className="font-medium">{practitioner.address || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Zone d'intervention:</span>
                  <p className="font-medium">{practitioner.intervention_zone || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Rayon d'intervention:</span>
                  <p className="font-medium">{practitioner.intervention_radius || 10} km</p>
                </div>
                {practitioner.communes_served && practitioner.communes_served.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Communes desservies:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {/* P3: Use value as key */}
                      {practitioner.communes_served.map((commune) => (
                        <Badge key={commune} variant="outline" className="text-xs">
                          {commune}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Expérience et compétences */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Award className="h-4 w-4" />
                Expérience et compétences
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Années d'expérience:</span>
                  <p className="font-medium">{practitioner.years_experience || 0} ans</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Numéro de licence:</span>
                  <p className="font-medium">{practitioner.license_number || 'N/A'}</p>
                </div>
                {practitioner.languages && practitioner.languages.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Languages className="h-3 w-3" /> Langues:
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {/* P3: Use value as key */}
                      {practitioner.languages.map((lang) => (
                        <Badge key={lang} variant="outline" className="text-xs">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {practitioner.diplomas && practitioner.diplomas.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Diplômes:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {/* P3: Use value as key */}
                      {practitioner.diplomas.map((diploma) => (
                        <Badge key={diploma} variant="secondary" className="text-xs">
                          {diploma}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {practitioner.certifications && practitioner.certifications.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Certifications:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {/* P3: Use value as key */}
                      {practitioner.certifications.map((cert) => (
                        <Badge key={cert} variant="secondary" className="text-xs">
                          {cert}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {practitioner.bio && (
                <div>
                  <span className="text-muted-foreground text-sm">Bio:</span>
                  <p className="text-sm mt-1">{practitioner.bio}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Documents KYC */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Documents KYC
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Pièce d'identité:</span>
                  <p className="font-medium">
                    {practitioner.id_document_url ? (
                      <Badge variant="default">Fourni</Badge>
                    ) : (
                      <Badge variant="outline">Non fourni</Badge>
                    )}
                  </p>
                  {practitioner.id_document_expiry && (
                    <p className="text-xs text-muted-foreground">
                      Expire: {new Date(practitioner.id_document_expiry).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Licence:</span>
                  <p className="font-medium">
                    {practitioner.license_document_url ? (
                      <Badge variant="default">Fourni</Badge>
                    ) : (
                      <Badge variant="outline">Non fourni</Badge>
                    )}
                  </p>
                  {practitioner.license_expiry && (
                    <p className="text-xs text-muted-foreground">
                      Expire: {new Date(practitioner.license_expiry).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Assurance:</span>
                  <p className="font-medium">
                    {practitioner.insurance_document_url ? (
                      <Badge variant="default">Fourni</Badge>
                    ) : (
                      <Badge variant="outline">Non fourni</Badge>
                    )}
                  </p>
                  {practitioner.insurance_expiry && (
                    <p className="text-xs text-muted-foreground">
                      Expire: {new Date(practitioner.insurance_expiry).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Informations de paiement */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Informations de paiement
              </h3>
              {paymentInfo ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Méthode:</span>
                    <p className="font-medium">{paymentInfo.payment_method}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Titulaire:</span>
                    <p className="font-medium">{paymentInfo.account_holder_name}</p>
                  </div>
                  {paymentInfo.phone_number && (
                    <div>
                      <span className="text-muted-foreground">Téléphone:</span>
                      <p className="font-medium">{paymentInfo.phone_number}</p>
                    </div>
                  )}
                  {paymentInfo.bank_name && (
                    <div>
                      <span className="text-muted-foreground">Banque:</span>
                      <p className="font-medium">{paymentInfo.bank_name}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Vérifié:</span>
                    <p>
                      <Badge variant={paymentInfo.is_verified ? 'default' : 'outline'}>
                        {paymentInfo.is_verified ? 'Oui' : 'Non'}
                      </Badge>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune information de paiement</p>
              )}
              
              {balance && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">Soldes</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Disponible:</span>
                      <p className="font-medium">{balance.balance_available?.toLocaleString()} {balance.currency}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">En attente:</span>
                      <p className="font-medium">{balance.balance_pending?.toLocaleString()} {balance.currency}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">En réserve:</span>
                      <p className="font-medium">{balance.balance_on_hold?.toLocaleString()} {balance.currency}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Derniers rendez-vous */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Derniers rendez-vous ({appointments?.length || 0})
              </h3>
              {appointments && appointments.length > 0 ? (
                <div className="space-y-2">
                  {appointments.map((appointment) => (
                    <div key={appointment.id} className="p-3 border rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{appointment.patient_name}</span>
                        <Badge
                          variant={
                            appointment.status === 'completed'
                              ? 'default'
                              : appointment.status === 'cancelled'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {appointment.status}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">{appointment.specialty}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(appointment.date).toLocaleDateString('fr-FR')} à {appointment.time}
                      </div>
                      {appointment.reason && (
                        <div className="text-xs mt-2 text-muted-foreground">
                          Motif: {appointment.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun rendez-vous</p>
              )}
            </div>

            <Separator />

            {/* Actions de suppression */}
            <div className="pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer définitivement ce praticien
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action supprimera définitivement le praticien "{practitioner.name}" et toutes ses données associées.
                      Cette action est irréversible.
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
                      onClick={() => deleteMutation.mutate(practitioner.user_id)}
                      disabled={confirmText !== 'SUPPRIMER' || deleteMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Praticien non trouvé
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
