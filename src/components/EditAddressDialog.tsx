import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUpdateAddress } from '@/hooks/useProfile';
import { AddressSearchInput } from './AddressSearchInput';

interface Address {
  id: string;
  label: string;
  address: string;
  city?: string;
  postal_code?: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default: boolean;
}

interface EditAddressDialogProps {
  address: Address;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAddressDialog({ address, userId, open, onOpenChange }: EditAddressDialogProps) {
  const updateAddress = useUpdateAddress();

  const [formData, setFormData] = useState({
    label: '',
    address: '',
    city: '',
    postal_code: '',
    latitude: null as number | null,
    longitude: null as number | null,
    is_default: false,
  });

  useEffect(() => {
    if (address) {
      setFormData({
        label: address.label || '',
        address: address.address || '',
        city: address.city || '',
        postal_code: address.postal_code || '',
        latitude: address.latitude || null,
        longitude: address.longitude || null,
        is_default: address.is_default || false,
      });
    }
  }, [address]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateAddress.mutateAsync({
      addressId: address.id,
      userId,
      data: {
        label: formData.label,
        address: formData.address,
        city: formData.city || null,
        postal_code: formData.postal_code || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
        is_default: formData.is_default,
      },
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier l'adresse</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-label">Libellé *</Label>
            <Input
              id="edit-label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              required
              placeholder="Domicile, Bureau..."
            />
          </div>

          <AddressSearchInput
            label="Adresse complète"
            value={formData.address}
            onChange={(location) => setFormData({
              ...formData,
              address: location.address,
              city: location.city || formData.city,
              latitude: location.latitude || null,
              longitude: location.longitude || null,
            })}
            placeholder="Rechercher une adresse au Bénin..."
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-city">Ville</Label>
              <Input
                id="edit-city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Cotonou"
              />
            </div>
            <div>
              <Label htmlFor="edit-postal_code">Code postal</Label>
              <Input
                id="edit-postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="01234"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="edit-is_default"
              checked={formData.is_default}
              onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
            />
            <Label htmlFor="edit-is_default">Définir comme adresse par défaut</Label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={updateAddress.isPending}>
              {updateAddress.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
