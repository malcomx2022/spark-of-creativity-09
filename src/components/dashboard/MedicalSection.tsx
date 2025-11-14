import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useMedicalProfile, useUpdateMedicalProfile } from '@/hooks/useProfile';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { Heart, AlertCircle, Pill } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

export function MedicalSection() {
  const { data: user } = useSupabaseUser();
  const { data: medicalProfile } = useMedicalProfile(user?.id);
  const updateMedicalProfile = useUpdateMedicalProfile();

  const [formData, setFormData] = useState({
    blood_type: medicalProfile?.blood_type || 'inconnu',
    allergies: medicalProfile?.allergies || '',
    chronic_diseases: medicalProfile?.chronic_diseases || '',
    current_medications: medicalProfile?.current_medications || '',
    additional_notes: medicalProfile?.additional_notes || '',
    share_with_practitioner: medicalProfile?.share_with_practitioner ?? true,
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
      });
    }
  }, [medicalProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      await updateMedicalProfile.mutateAsync({
        userId: user.id,
        data: formData,
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
                onValueChange={(value) => setFormData({ ...formData, blood_type: value as any })}
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
    </div>
  );
}
