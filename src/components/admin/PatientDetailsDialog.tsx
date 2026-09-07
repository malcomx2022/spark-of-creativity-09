import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Address, EmergencyContact, Profile } from '@/types/profile';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { User, Phone, MapPin, Heart, Calendar, Stethoscope, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

/** Réponse de GET /admin/users/patients/:id : profil du patient, contacts, adresses, dossier médical, derniers rendez-vous. */
interface AdminPatientDetails extends Profile {
  email: string | null;
  emergency_contacts: EmergencyContact[];
  addresses: Address[];
  medical_profile: {
    blood_type: string | null;
    allergies: string | null;
    chronic_diseases: string | null;
    current_medications: string | null;
    additional_notes: string | null;
  } | null;
  appointments: {
    id: string;
    specialty: string;
    status: string;
    practitioner_name: string | null;
    date: string;
    time: string;
    reason: string | null;
  }[];
}

interface PatientDetailsDialogProps {
  patientId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function PatientDetailsDialog({ patientId, onOpenChange }: PatientDetailsDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!patientId) {
        throw new Error("Aucun patient sélectionné");
      }

      // Suppression définitive (super_admin / ops), journalisée côté API
      return api.delete(`/admin/users/${patientId}`, { userType: 'patient', confirm: 'SUPPRIMER' });
    },
    onSuccess: () => {
      toast({
        title: "Patient supprimé",
        description: "Le patient a été supprimé définitivement.",
      });
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      setConfirmText('');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      toast({
        title: "Erreur",
        description: errorMessage(error, 'Impossible de supprimer le patient'),
        variant: "destructive",
      });
    },
  });

  // Fiche complète du patient vue par l'admin (GET /admin/users/patients/:id)
  const { data: adminPatient, isLoading: detailsLoading } = useQuery({
    queryKey: ['admin-patient-details', patientId],
    queryFn: () => api.get<AdminPatientDetails>(`/admin/users/patients/${patientId}`),
    enabled: !!patientId,
  });
  const medicalProfile = adminPatient?.medical_profile ?? null;
  const appointments = adminPatient?.appointments ?? [];

  const isLoading = detailsLoading;
  const profile = adminPatient ?? null;
  const contacts = adminPatient?.emergency_contacts || [];
  const addresses = adminPatient?.addresses || [];

  return (
    <Dialog open={!!patientId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Détails du patient
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8">Chargement...</div>
        ) : (
          <div className="space-y-6">
            {/* Informations générales */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Informations générales
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Nom complet:</span>
                  <p className="font-medium">{profile?.full_name || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Téléphone:</span>
                  <p className="font-medium">{profile?.phone || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sexe:</span>
                  <p><Badge variant="outline">{profile?.gender || 'N/A'}</Badge></p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date de naissance:</span>
                  <p className="font-medium">
                    {profile?.date_of_birth
                      ? new Date(profile.date_of_birth).toLocaleDateString('fr-FR')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Inscrit le:</span>
                  <p className="font-medium">
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString('fr-FR')
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Profil médical */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Heart className="h-4 w-4" />
                Profil médical
              </h3>
              {medicalProfile ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Groupe sanguin:</span>
                    <p className="font-medium">{medicalProfile.blood_type || 'Non renseigné'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Allergies:</span>
                    <p className="font-medium">{medicalProfile.allergies || 'Aucune'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Maladies chroniques:</span>
                    <p className="font-medium">{medicalProfile.chronic_diseases || 'Aucune'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Médicaments actuels:</span>
                    <p className="font-medium">{medicalProfile.current_medications || 'Aucun'}</p>
                  </div>
                  {medicalProfile.additional_notes && (
                    <div>
                      <span className="text-muted-foreground">Notes additionnelles:</span>
                      <p className="font-medium">{medicalProfile.additional_notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun profil médical</p>
              )}
            </div>

            <Separator />

            {/* Contacts d'urgence */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Contacts d'urgence
              </h3>
              {contacts.length > 0 ? (
                <div className="space-y-2">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="p-3 border rounded-lg text-sm">
                      <div className="font-medium">{contact.name}</div>
                      <div className="text-muted-foreground">{contact.phone}</div>
                      {contact.relationship && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {contact.relationship}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun contact d'urgence</p>
              )}
            </div>

            <Separator />

            {/* Adresses */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Adresses
              </h3>
              {addresses.length > 0 ? (
                <div className="space-y-2">
                  {addresses.map((address) => (
                    <div key={address.id} className="p-3 border rounded-lg text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{address.label}</span>
                        {address.is_default && (
                          <Badge variant="secondary" className="text-xs">Par défaut</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-1">{address.address}</div>
                      {address.city && (
                        <div className="text-xs text-muted-foreground">
                          {address.city}
                          {address.postal_code && ` - ${address.postal_code}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune adresse</p>
              )}
            </div>

            <Separator />

            {/* Rendez-vous */}
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
                        <span className="font-medium flex items-center gap-2">
                          <Stethoscope className="h-3 w-3" />
                          {appointment.specialty}
                        </span>
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
                      <div className="text-muted-foreground">
                        {appointment.practitioner_name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
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
                    Supprimer définitivement ce patient
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action supprimera définitivement le patient "{profile?.full_name}" et toutes ses données associées.
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
                      onClick={() => deleteMutation.mutate()}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
