import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  usePractitionerRates,
  useCreatePractitionerRate,
  useUpdatePractitionerRate,
  useDeletePractitionerRate,
  PractitionerRate,
} from "@/hooks/usePractitionerRates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PractitionerRatesSectionProps {
  practitionerId: string;
}

const serviceTypes = [
  { value: "coaching_individuel", label: "Coaching Individuel" },
  { value: "consultation_domicile", label: "Consultation à domicile" },
  { value: "consultation_cabinet", label: "Consultation au cabinet" },
  { value: "seance_evaluation", label: "Séance d'évaluation" },
  { value: "suivi_nutritionnel", label: "Suivi nutritionnel" },
];

export function PractitionerRatesSection({ practitionerId }: PractitionerRatesSectionProps) {
  const { data: rates, isLoading } = usePractitionerRates(practitionerId);
  const createRate = useCreatePractitionerRate();
  const updateRate = useUpdatePractitionerRate();
  const deleteRate = useDeletePractitionerRate();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<PractitionerRate | null>(null);
  const [formData, setFormData] = useState({
    service_type: "",
    base_price: "",
    duration_minutes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const rateData = {
      practitioner_id: practitionerId,
      service_type: formData.service_type,
      base_price: parseInt(formData.base_price),
      duration_minutes: parseInt(formData.duration_minutes),
    };

    if (editingRate) {
      await updateRate.mutateAsync({ id: editingRate.id, ...rateData });
    } else {
      await createRate.mutateAsync(rateData);
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ service_type: "", base_price: "", duration_minutes: "" });
    setEditingRate(null);
  };

  const handleEdit = (rate: PractitionerRate) => {
    setEditingRate(rate);
    setFormData({
      service_type: rate.service_type,
      base_price: rate.base_price.toString(),
      duration_minutes: rate.duration_minutes.toString(),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce tarif ?")) {
      await deleteRate.mutateAsync(id);
    }
  };

  if (isLoading) {
    return <div>Chargement...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarifs des Services</CardTitle>
        <CardDescription>
          Définissez les tarifs pour vos différents types de consultations individuelles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={() => {
            resetForm();
            setIsDialogOpen(true);
          }}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un tarif
        </Button>

        {rates && rates.length > 0 ? (
          <div className="space-y-2">
            {rates.map((rate) => (
              <div
                key={rate.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div>
                  <p className="font-medium">
                    {serviceTypes.find((s) => s.value === rate.service_type)?.label || rate.service_type}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {rate.base_price} XOF - {rate.duration_minutes} minutes
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(rate)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(rate.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Aucun tarif défini. Ajoutez votre premier tarif pour commencer à recevoir des rendez-vous individuels.
          </p>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingRate ? "Modifier le tarif" : "Ajouter un tarif"}
              </DialogTitle>
              <DialogDescription>
                Définissez le prix et la durée pour ce type de service
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="service_type">Type de service</Label>
                <Select
                  value={formData.service_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, service_type: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un type de service" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="base_price">Prix (XOF)</Label>
                <Input
                  id="base_price"
                  type="number"
                  min="0"
                  value={formData.base_price}
                  onChange={(e) =>
                    setFormData({ ...formData, base_price: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration_minutes">Durée (minutes)</Label>
                <Input
                  id="duration_minutes"
                  type="number"
                  min="15"
                  step="15"
                  value={formData.duration_minutes}
                  onChange={(e) =>
                    setFormData({ ...formData, duration_minutes: e.target.value })
                  }
                  required
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Annuler
                </Button>
                <Button type="submit">
                  {editingRate ? "Modifier" : "Ajouter"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
