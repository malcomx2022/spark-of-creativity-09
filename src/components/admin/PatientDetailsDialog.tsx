import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { usePatientProfileData } from '@/hooks/usePatientProfileData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Phone, MapPin, Heart, Calendar, Stethoscope } from 'lucide-react';

interface PatientDetailsDialogProps {
  patientId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function PatientDetailsDialog({ patientId, onOpenChange }: PatientDetailsDialogProps) {
  const { data: patientData, isLoading: profileLoading } = usePatientProfileData(patientId || undefined);
  
  const { data: medicalProfile, isLoading: medicalLoading } = useQuery({
    queryKey: ['patient-medical-profile', patientId],
    queryFn: async () => {
      if (!patientId) return null;
      const { data, error } = await supabase
        .from('medical_profiles')
        .select('*')
        .eq('user_id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  const { data: appointments, isLoading: appointmentsLoading } = useQuery({
    queryKey: ['patient-appointments', patientId],
    queryFn: async () => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!patientId,
  });

  const isLoading = profileLoading || medicalLoading || appointmentsLoading;
  const profile = patientData?.profile;
  const contacts = patientData?.contacts || [];
  const addresses = patientData?.addresses || [];

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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
