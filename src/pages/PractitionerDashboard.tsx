import { useState } from 'react';
import Header from '@/components/Header';
import { AppointmentCard } from '@/components/AppointmentCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Appointment } from '@/types/appointment';

export default function PractitionerDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: '1',
      patientName: 'Marie Dubois',
      patientId: 'patient-1',
      practitionerId: 'prac-1',
      practitionerName: 'Dr. Jean Martin',
      specialty: 'Médecin généraliste',
      date: '2025-10-10',
      time: '14:00',
      duration: 60,
      status: 'confirmed',
      address: '15 Rue de la Paix, 75001 Paris',
      reason: 'Consultation de suivi',
      notes: 'Patient diabétique, contrôle trimestriel',
      urgencyLevel: 'non-urgent'
    },
    {
      id: '2',
      patientName: 'Jean Dupont',
      patientId: 'patient-2',
      practitionerId: 'prac-1',
      practitionerName: 'Dr. Jean Martin',
      specialty: 'Médecin généraliste',
      date: '2025-10-08',
      time: '10:00',
      duration: 45,
      status: 'pending',
      address: '28 Avenue des Champs, 75008 Paris',
      reason: 'Douleurs abdominales',
      urgencyLevel: 'urgent'
    },
    {
      id: '3',
      patientName: 'Sophie Bernard',
      patientId: 'patient-3',
      practitionerId: 'prac-1',
      practitionerName: 'Dr. Jean Martin',
      specialty: 'Médecin généraliste',
      date: '2025-10-10',
      time: '16:00',
      duration: 30,
      status: 'pending',
      address: '42 Boulevard Saint-Germain, 75005 Paris',
      reason: 'Renouvellement ordonnance',
      urgencyLevel: 'non-urgent'
    }
  ]);

  const handleConfirm = (id: string) => {
    setAppointments(appointments.map(apt =>
      apt.id === id ? { ...apt, status: 'confirmed' as const } : apt
    ));
    toast({
      title: 'Rendez-vous confirmé',
      description: 'Le patient a été notifié de la confirmation.'
    });
  };

  const handleComplete = (id: string) => {
    setAppointments(appointments.map(apt =>
      apt.id === id ? { ...apt, status: 'completed' as const } : apt
    ));
    toast({
      title: 'Consultation terminée',
      description: 'Le rendez-vous a été marqué comme terminé.'
    });
  };

  const handleCancel = (id: string) => {
    setAppointments(appointments.map(apt =>
      apt.id === id ? { ...apt, status: 'cancelled' as const } : apt
    ));
    toast({
      title: 'Rendez-vous annulé',
      description: 'Le patient a été notifié de l\'annulation.',
      variant: 'destructive'
    });
  };

  const pendingAppointments = appointments.filter(apt => apt.status === 'pending');
  const confirmedAppointments = appointments.filter(apt => apt.status === 'confirmed');
  const completedAppointments = appointments.filter(apt => apt.status === 'completed');

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Espace praticien</h1>
          <p className="text-muted-foreground">Gérez vos consultations à domicile</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingAppointments.length}</div>
              <p className="text-xs text-muted-foreground">À confirmer</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Confirmés</CardTitle>
              <Calendar className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{confirmedAppointments.length}</div>
              <p className="text-xs text-muted-foreground">À venir</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Terminés</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedAppointments.length}</div>
              <p className="text-xs text-muted-foreground">Ce mois</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Temps total</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {appointments.reduce((acc, apt) => acc + apt.duration, 0)} min
              </div>
              <p className="text-xs text-muted-foreground">Ce mois</p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold">Mes consultations</h2>
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">
              En attente ({pendingAppointments.length})
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              Confirmés ({confirmedAppointments.length})
            </TabsTrigger>
            <TabsTrigger value="all">Tous</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingAppointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucune demande en attente</p>
                </CardContent>
              </Card>
            ) : (
              pendingAppointments.map(appointment => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="practitioner"
                  onConfirm={handleConfirm}
                  onCancel={handleCancel}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="confirmed" className="space-y-4">
            {confirmedAppointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucun rendez-vous confirmé</p>
                </CardContent>
              </Card>
            ) : (
              confirmedAppointments.map(appointment => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="practitioner"
                  onComplete={handleComplete}
                  onCancel={handleCancel}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {appointments.map(appointment => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                userRole="practitioner"
                onConfirm={appointment.status === 'pending' ? handleConfirm : undefined}
                onComplete={appointment.status === 'confirmed' ? handleComplete : undefined}
                onCancel={
                  appointment.status !== 'completed' && appointment.status !== 'cancelled'
                    ? handleCancel
                    : undefined
                }
              />
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
