import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProfile, useUpdateProfile, useEmergencyContacts, useAddresses } from '@/hooks/useProfile';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';
import { User, MapPin, Phone } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { AddEmergencyContactDialog } from '@/components/AddEmergencyContactDialog';
import { AddAddressDialog } from '@/components/AddAddressDialog';

export function ProfileSection() {
  const { data: user } = useSupabaseUser();
  const { data: profile } = useProfile(user?.id);
  const { data: emergencyContacts = [] } = useEmergencyContacts(user?.id);
  const { data: addresses = [] } = useAddresses(user?.id);
  const updateProfile = useUpdateProfile();

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    gender: profile?.gender || 'non_specifie',
    date_of_birth: profile?.date_of_birth || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      await updateProfile.mutateAsync({
        userId: user.id,
        data: formData,
      });
      toast({
        title: 'Profil mis à jour',
        description: 'Vos informations ont été enregistrées avec succès.',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le profil.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations personnelles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="full_name">Nom complet</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Votre nom complet"
                />
              </div>
              <div>
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+229 XX XX XX XX"
                />
              </div>
              <div>
                <Label htmlFor="gender">Sexe</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => setFormData({ ...formData, gender: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="homme">Homme</SelectItem>
                    <SelectItem value="femme">Femme</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                    <SelectItem value="non_specifie">Non spécifié</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="date_of_birth">Date de naissance</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Contacts d'urgence
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emergencyContacts.length === 0 ? (
            <p className="text-muted-foreground">Aucun contact d'urgence enregistré</p>
          ) : (
            <div className="space-y-3">
              {emergencyContacts.map((contact) => (
                <div key={contact.id} className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-sm text-muted-foreground">{contact.phone}</p>
                    {contact.relationship && (
                      <p className="text-xs text-muted-foreground">{contact.relationship}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {user?.id && <AddEmergencyContactDialog userId={user.id} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Adresses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <p className="text-muted-foreground">Aucune adresse enregistrée</p>
          ) : (
            <div className="space-y-3">
              {addresses.map((address) => (
                <div key={address.id} className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{address.label}</p>
                    <p className="text-sm text-muted-foreground">{address.address}</p>
                    {address.city && (
                      <p className="text-xs text-muted-foreground">
                        {address.city} {address.postal_code}
                      </p>
                    )}
                  </div>
                  {address.is_default && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                      Par défaut
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {user?.id && <AddAddressDialog userId={user.id} />}
        </CardContent>
      </Card>
    </div>
  );
}
