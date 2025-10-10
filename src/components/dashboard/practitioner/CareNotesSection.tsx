import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FileText, Upload, Share2 } from "lucide-react";

export default function CareNotesSection() {
  const [shareWithPatient, setShareWithPatient] = useState(false);

  // Mock data
  const appointments = [
    {
      id: "1",
      patientName: "Marie Dupont",
      date: "15 Oct 2025",
      service: "Pansement",
      hasNote: true,
    },
    {
      id: "2",
      patientName: "Jean Martin",
      date: "14 Oct 2025",
      service: "Perfusion",
      hasNote: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Liste des RDV avec notes */}
      <Card>
        <CardHeader>
          <CardTitle>Rendez-vous récents</CardTitle>
          <CardDescription>Gérez les notes de soin pour chaque visite</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {appointments.map((apt) => (
              <div key={apt.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{apt.patientName}</p>
                  <p className="text-sm text-muted-foreground">
                    {apt.date} • {apt.service}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {apt.hasNote ? (
                    <Badge variant="default">Note complétée</Badge>
                  ) : (
                    <Badge variant="secondary">Sans note</Badge>
                  )}
                  <Button size="sm">
                    {apt.hasNote ? "Voir / Modifier" : "Créer une note"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Formulaire SOAP */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Note de soin (Format SOAP)</CardTitle>
              <CardDescription>Subjectif, Objectif, Analyse, Plan</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="share">Partager avec le patient</Label>
              <Switch
                id="share"
                checked={shareWithPatient}
                onCheckedChange={setShareWithPatient}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="subjective">Subjectif (S)</Label>
            <Textarea
              id="subjective"
              placeholder="Plaintes du patient, symptômes rapportés..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="objective">Objectif (O)</Label>
            <Textarea
              id="objective"
              placeholder="Observations cliniques, mesures, examens..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="assessment">Analyse (A)</Label>
            <Textarea
              id="assessment"
              placeholder="Diagnostic, évaluation de la situation..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="plan">Plan (P)</Label>
            <Textarea
              id="plan"
              placeholder="Plan de traitement, recommandations, suivi..."
              rows={3}
            />
          </div>

          <div>
            <Label>Pièces jointes</Label>
            <div className="flex items-center gap-2 mt-2">
              <Input type="file" accept="image/*,application/pdf" multiple />
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Photos de pansement, prescriptions scannées, etc.
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button className="flex-1">Sauvegarder</Button>
            {shareWithPatient && (
              <Button variant="outline">
                <Share2 className="h-4 w-4 mr-2" />
                Partager
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}