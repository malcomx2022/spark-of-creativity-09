import type { Gender } from "@/types/profile";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUpdateProfile, useDeleteEmergencyContact, useDeleteAddress } from '@/hooks/useProfile';
import { useAuthUser } from '@/hooks/useAuthUser';
import { usePatientProfileData } from '@/hooks/usePatientProfileData';
import { User, MapPin, Phone, RefreshCw, Copy, Check, Trash2, Pencil } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { AddEmergencyContactDialog } from '@/components/AddEmergencyContactDialog';
import { AddAddressDialog } from '@/components/AddAddressDialog';
import { EditEmergencyContactDialog } from '@/components/EditEmergencyContactDialog';
import { EditAddressDialog } from '@/components/EditAddressDialog';
import { AvatarUpload } from '@/components/dashboard/AvatarUpload';
import { api } from '@/lib/api';


export function ProfileSection() {
  const { data: user } = useAuthUser();
  const { data: profileData, isLoading, isFetching, refetch } = usePatientProfileData(user?.id);
  const profile = profileData?.profile;
  const emergencyContacts = profileData?.contacts || [];
  const addresses = profileData?.addresses || [];
  const updateProfile = useUpdateProfile();
  const deleteContact = useDeleteEmergencyContact();
  const deleteAddress = useDeleteAddress();

  const hasInitialized = useRef(false);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    gender: 'non_specifie' as Gender,
    date_of_birth: '',
  });

  // États pour copier
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // États pour suppression avec confirmation
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);

  // États pour modification
  const [contactToEdit, setContactToEdit] = useState<typeof emergencyContacts[0] | null>(null);
  const [addressToEdit, setAddressToEdit] = useState<typeof addresses[0] | null>(null);

  useEffect(() => {
    if (profile && !hasInitialized.current) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        gender: profile.gender || 'non_specifie',
        date_of_birth: profile.date_of_birth || '',
      });
      hasInitialized.current = true;
    }
  }, [profile]);

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

  // Copier un numéro de téléphone
  const handleCopyPhone = async (phone: string, id: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(id);
      toast({ title: 'Copié', description: 'Numéro de téléphone copié dans le presse-papiers.' });
      setTimeout(() => setCopiedPhone(null), 2000);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier le numéro.', variant: 'destructive' });
    }
  };

  // Copier une adresse
  const handleCopyAddress = async (address: string, id: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(id);
      toast({ title: 'Copié', description: 'Adresse copiée dans le presse-papiers.' });
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de copier l\'adresse.', variant: 'destructive' });
    }
  };

  // Supprimer un contact
  const handleDeleteContact = async () => {
    if (!contactToDelete || !user?.id) return;
    await deleteContact.mutateAsync({ contactId: contactToDelete, userId: user.id });
    setContactToDelete(null);
  };

  // Supprimer une adresse
  const handleDeleteAddress = async () => {
    if (!addressToDelete || !user?.id) return;
    await deleteAddress.mutateAsync({ addressId: addressToDelete, userId: user.id });
    setAddressToDelete(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton informations personnelles */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>

        {/* Skeleton contacts d'urgence */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="p-3 border rounded-lg">
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Skeleton adresses */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="p-3 border rounded-lg">
                <Skeleton className="h-5 w-24 mb-2" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Mon Profil</h2>
          <p className="text-muted-foreground">Gérez vos informations personnelles, contacts et adresses</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col items-center pb-2">
          <AvatarUpload
            userId={user?.id || ""}
            currentImageUrl={profile?.avatar_url}
            userName={profile?.full_name || ""}
            onImageUploaded={async (path) => {
              if (!user?.id) return;
              // L'API met à jour profiles.avatar_url et synchronise practitioners.image le cas échéant
              await api.patch('/profile', { avatarUrl: path });

              refetch();
            }}
          />
        </CardHeader>
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
                  onValueChange={(value) => setFormData({ ...formData, gender: value as Gender })}
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
            <Badge variant="secondary" className="ml-2">
              {emergencyContacts.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emergencyContacts.length === 0 ? (
            <p className="text-muted-foreground">Aucun contact d'urgence enregistré</p>
          ) : (
            <div className="space-y-3">
              {emergencyContacts.map((contact) => (
                <div key={contact.id} className="flex justify-between items-center p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{contact.name}</p>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm text-muted-foreground cursor-help">{contact.phone}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Cliquez sur l'icône pour copier</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopyPhone(contact.phone, contact.id)}
                      >
                        {copiedPhone === contact.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    {contact.relationship && (
                      <p className="text-xs text-muted-foreground">{contact.relationship}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setContactToEdit(contact)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setContactToDelete(contact.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
            <Badge variant="secondary" className="ml-2">
              {addresses.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {addresses.length === 0 ? (
            <p className="text-muted-foreground">Aucune adresse enregistrée</p>
          ) : (
            <div className="space-y-3">
              {addresses.map((address) => (
                <div key={address.id} className="flex justify-between items-center p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{address.label}</p>
                      {address.is_default && (
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
                          Par défaut
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-sm text-muted-foreground truncate max-w-[250px] cursor-help">
                              {address.address}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-sm">
                            <p>{address.address}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={() => handleCopyAddress(
                          `${address.address}${address.city ? `, ${address.city}` : ''}${address.postal_code ? ` ${address.postal_code}` : ''}`,
                          address.id
                        )}
                      >
                        {copiedAddress === address.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    {address.city && (
                      <p className="text-xs text-muted-foreground">
                        {address.city} {address.postal_code}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setAddressToEdit(address)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setAddressToDelete(address.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {user?.id && <AddAddressDialog userId={user.id} />}
        </CardContent>
      </Card>

      {/* AlertDialog pour supprimer un contact */}
      <AlertDialog open={!!contactToDelete} onOpenChange={() => setContactToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce contact ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le contact d'urgence sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContact}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteContact.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog pour supprimer une adresse */}
      <AlertDialog open={!!addressToDelete} onOpenChange={() => setAddressToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette adresse ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'adresse sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAddress}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAddress.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog pour modifier un contact */}
      {contactToEdit && user?.id && (
        <EditEmergencyContactDialog
          contact={contactToEdit}
          userId={user.id}
          open={!!contactToEdit}
          onOpenChange={(open) => !open && setContactToEdit(null)}
        />
      )}

      {/* Dialog pour modifier une adresse */}
      {addressToEdit && user?.id && (
        <EditAddressDialog
          address={addressToEdit}
          userId={user.id}
          open={!!addressToEdit}
          onOpenChange={(open) => !open && setAddressToEdit(null)}
        />
      )}
    </div>
  );
}
