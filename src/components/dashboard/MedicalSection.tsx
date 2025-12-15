import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useMedicalProfile, useUpdateMedicalProfile } from '@/hooks/useProfile';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { Heart, AlertCircle, Pill, Stethoscope, User, Mail, Phone } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'inconnu';

export function MedicalSection() {
  const { data: user } = useSupabaseUser();
  const { data: medicalProfile } = useMedicalProfile(user?.id);
  const updateMedicalProfile = useUpdateMedicalProfile();

  const [doctorSelectionMode, setDoctorSelectionMode] = useState<'platform' | 'manual' | 'none'>('none');

  // Fetch available practitioners (doctors) on the platform
  const { data: practitioners = [] } = useQuery({
    queryKey: ['practitioners-for-doctor-selection'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name, specialty, phone')
        .eq('kyc_status', 'approved')
        .eq('available', true)
        .in('practitioner_type', ['medecin', 'infirmier', 'sage_femme', 'autre'])
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });

  const [formData, setFormData] = useState({
    blood_type: medicalProfile?.blood_type || 'inconnu',
    allergies: medicalProfile?.allergies || '',
    chronic_diseases: medicalProfile?.chronic_diseases || '',
    current_medications: medicalProfile?.current_medications || '',
    additional_notes: medicalProfile?.additional_notes || '',
    share_with_practitioner: medicalProfile?.share_with_practitioner ?? true,
    primary_doctor_id: medicalProfile?.primary_doctor_id || '',
    primary_doctor_name: medicalProfile?.primary_doctor_name || '',
    primary_doctor_email: medicalProfile?.primary_doctor_email || '',
    primary_doctor_phone: medicalProfile?.primary_doctor_phone || '',
  });

  useEffect(() => {
    if (medicalProfile) {
      setFormData({
        blood_type: medicalProfile.blood_type || 'inconnu',
        allergies: medicalProfile.allergies || '',
        chronic_diseases: medicalProfile.chronic_diseases || '',
        current_medications: medicalProfile.current_medications || '',
        additional_notes: medicalProfile.additional_notes || '',
        share_with_practitioner: medicalProfile.share_with_practitioner ?? true,
        primary_doctor_id: medicalProfile.primary_doctor_id || '',
        primary_doctor_name: medicalProfile.primary_doctor_name || '',
        primary_doctor_email: medicalProfile.primary_doctor_email || '',
        primary_doctor_phone: medicalProfile.primary_doctor_phone || '',
      });

      // Determine selection mode
      if (medicalProfile.primary_doctor_id) {
        setDoctorSelectionMode('platform');
      } else if (medicalProfile.primary_doctor_name) {
        setDoctorSelectionMode('manual');
      } else {
        setDoctorSelectionMode('none');
      }
    }
  }, [medicalProfile]);

  const handlePractitionerSelect = (practitionerId: string) => {
    const selectedPractitioner = practitioners.find(p => p.id === practitionerId);
    if (selectedPractitioner) {
      setFormData({
        ...formData,
        primary_doctor_id: practitionerId,
        primary_doctor_name: selectedPractitioner.name,
        primary_doctor_phone: '', // Téléphone non exposé pour sécurité - utiliser la messagerie
        primary_doctor_email: '', // Practitioners don't have email in public view
      });
    }
  };

  const handleDoctorModeChange = (mode: 'platform' | 'manual' | 'none') => {
    setDoctorSelectionMode(mode);
    if (mode === 'none') {
      setFormData({
        ...formData,
        primary_doctor_id: '',
        primary_doctor_name: '',
        primary_doctor_email: '',
        primary_doctor_phone: '',
      });
    } else if (mode === 'manual') {
      setFormData({
        ...formData,
        primary_doctor_id: '',
      });
    } else if (mode === 'platform') {
      setFormData({
        ...formData,
        primary_doctor_email: '',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      await updateMedicalProfile.mutateAsync({
        userId: user.id,
        data: {
          blood_type: formData.blood_type as BloodType,
          allergies: formData.allergies || null,
          chronic_diseases: formData.chronic_diseases || null,
          current_medications: formData.current_medications || null,
          additional_notes: formData.additional_notes || null,
          share_with_practitioner: formData.share_with_practitioner,
          primary_doctor_id: formData.primary_doctor_id || null,
          primary_doctor_name: formData.primary_doctor_name || null,
          primary_doctor_email: formData.primary_doctor_email || null,
          primary_doctor_phone: formData.primary_doctor_phone || null,
        },
      });
      toast({
        title: 'Profil médical mis à jour',
        description: 'Vos informations médicales ont été enregistrées.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le profil médical.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Informations médicales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="blood_type">Groupe sanguin</Label>
              <Select
                value={formData.blood_type}
                onValueChange={(value) => setFormData({ ...formData, blood_type: value as BloodType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                  <SelectItem value="inconnu">Inconnu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="allergies" className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Allergies
              </Label>
              <Textarea
                id="allergies"
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                placeholder="Listez vos allergies (médicaments, aliments, etc.)"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="chronic_diseases">Maladies chroniques</Label>
              <Textarea
                id="chronic_diseases"
                value={formData.chronic_diseases}
                onChange={(e) => setFormData({ ...formData, chronic_diseases: e.target.value })}
                placeholder="Listez vos maladies chroniques (diabète, hypertension, etc.)"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="current_medications" className="flex items-center gap-2">
                <Pill className="h-4 w-4" />
                Médicaments en cours
              </Label>
              <Textarea
                id="current_medications"
                value={formData.current_medications}
                onChange={(e) => setFormData({ ...formData, current_medications: e.target.value })}
                placeholder="Listez les médicaments que vous prenez actuellement"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="additional_notes">Notes supplémentaires</Label>
              <Textarea
                id="additional_notes"
                value={formData.additional_notes}
                onChange={(e) => setFormData({ ...formData, additional_notes: e.target.value })}
                placeholder="Autres informations médicales importantes"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label htmlFor="share_consent">Partager avec les praticiens</Label>
                <p className="text-sm text-muted-foreground">
                  Autoriser l'accès à ces informations lors des consultations
                </p>
              </div>
              <Switch
                id="share_consent"
                checked={formData.share_with_practitioner}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, share_with_practitioner: checked })
                }
              />
            </div>

            <Button type="submit" disabled={updateMedicalProfile.isPending}>
              {updateMedicalProfile.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Médecin traitant */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Médecin traitant
          </CardTitle>
          <CardDescription>
            Désignez votre médecin traitant pour le partage des rapports de consultation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={doctorSelectionMode}
            onValueChange={(value) => handleDoctorModeChange(value as 'platform' | 'manual' | 'none')}
            className="space-y-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="none" id="doctor-none" />
              <Label htmlFor="doctor-none" className="font-normal cursor-pointer">
                Pas de médecin traitant désigné
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="platform" id="doctor-platform" />
              <Label htmlFor="doctor-platform" className="font-normal cursor-pointer">
                Choisir parmi les praticiens de la plateforme
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="manual" id="doctor-manual" />
              <Label htmlFor="doctor-manual" className="font-normal cursor-pointer">
                Saisir manuellement les coordonnées
              </Label>
            </div>
          </RadioGroup>

          {doctorSelectionMode === 'platform' && (
            <div className="space-y-3 pt-4 border-t">
              <Label>Sélectionner un praticien</Label>
              <Select
                value={formData.primary_doctor_id}
                onValueChange={handlePractitionerSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un praticien..." />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {practitioners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} - {p.specialty}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.primary_doctor_name && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">{formData.primary_doctor_name}</p>
                  {formData.primary_doctor_phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {formData.primary_doctor_phone}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {doctorSelectionMode === 'manual' && (
            <div className="space-y-3 pt-4 border-t">
              <div>
                <Label htmlFor="doctor_name" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Nom du médecin
                </Label>
                <Input
                  id="doctor_name"
                  value={formData.primary_doctor_name}
                  onChange={(e) => setFormData({ ...formData, primary_doctor_name: e.target.value })}
                  placeholder="Dr. Jean Dupont"
                />
              </div>
              <div>
                <Label htmlFor="doctor_email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email du médecin
                </Label>
                <Input
                  id="doctor_email"
                  type="email"
                  value={formData.primary_doctor_email}
                  onChange={(e) => setFormData({ ...formData, primary_doctor_email: e.target.value })}
                  placeholder="docteur@exemple.com"
                />
              </div>
              <div>
                <Label htmlFor="doctor_phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Téléphone du médecin
                </Label>
                <Input
                  id="doctor_phone"
                  type="tel"
                  value={formData.primary_doctor_phone}
                  onChange={(e) => setFormData({ ...formData, primary_doctor_phone: e.target.value })}
                  placeholder="+229 XX XX XX XX"
                />
              </div>
            </div>
          )}

          <Button 
            onClick={handleSubmit} 
            disabled={updateMedicalProfile.isPending}
            className="mt-4"
          >
            {updateMedicalProfile.isPending ? 'Enregistrement...' : 'Enregistrer le médecin traitant'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
