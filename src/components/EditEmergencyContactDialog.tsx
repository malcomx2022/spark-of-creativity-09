import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { useUpdateEmergencyContact } from '@/hooks/useProfile';

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
}

interface EditEmergencyContactDialogProps {
  contact: EmergencyContact;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEmergencyContactDialog({ contact, userId, open, onOpenChange }: EditEmergencyContactDialogProps) {
  const updateContact = useUpdateEmergencyContact();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    relationship: '',
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name || '',
        phone: contact.phone || '',
        relationship: contact.relationship || '',
      });
    }
  }, [contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateContact.mutateAsync({
      contactId: contact.id,
      userId,
      data: formData,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background">
        <DialogHeader>
          <DialogTitle>Modifier le contact d'urgence</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-name">Nom complet *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Jean Dupont"
            />
          </div>
          <div>
            <Label htmlFor="edit-phone">Téléphone *</Label>
            <PhoneInput
              id="edit-phone"
              value={formData.phone}
              onChange={(value) => setFormData({ ...formData, phone: value })}
              countryCode="+229"
              localNumberLength={8}
            />
          </div>
          <div>
            <Label htmlFor="edit-relationship">Relation</Label>
            <Input
              id="edit-relationship"
              value={formData.relationship}
              onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
              placeholder="Époux, Parent, Ami..."
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={updateContact.isPending}>
              {updateContact.isPending ? 'Enregistrement...' : 'Enregistrer'}
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
