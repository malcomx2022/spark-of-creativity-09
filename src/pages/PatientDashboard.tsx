import { useState } from 'react';
import Header from '@/components/Header';
import { AppointmentCard } from '@/components/AppointmentCard';
import { NewAppointmentDialog } from '@/components/NewAppointmentDialog';
import GPSTracking from '@/components/GPSTracking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Calendar, Clock, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { Appointment, CreateAppointmentData } from '@/types/appointment';

export default function PatientDashboard() {
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
      urgencyLevel: 'non-urgent'
    },
    {
      id: '2',
      patientName: 'Marie Dubois',
      patientId: 'patient-1',
      practitionerId: 'prac-2',
      practitionerName: 'Sophie Leclerc',
      specialty: 'Infirmier(ère)',
      date: '2025-10-08',
      time: '10:00',
      duration: 30,
      status: 'pending',
      address: '15 Rue de la Paix, 75001 Paris',
      reason: 'Prise de sang',
      urgencyLevel: 'semi-urgent'
    }
  ]);

  const handleNewAppointment = (data: CreateAppointmentData) => {
    const newAppointment: Appointment = {
      id: Date.now().toString(),
      patientName: 'Marie Dubois',
      patientId: 'patient-1',
      practitionerId: 'pending',
      practitionerName: 'En attente d\'attribution',
      specialty: data.specialty,
      date: data.date,
      time: data.time,
      duration: 60,
      status: 'pending',
      address: '15 Rue de la Paix, 75001 Paris',
      reason: data.reason,
      urgencyLevel: data.urgencyLevel as any
    };

    setAppointments([newAppointment, ...appointments]);
    toast({
      title: 'Demande envoyée',
      description: 'Votre demande de rendez-vous a été envoyée avec succès.'
    });
  };

  const handleCancel = (id: string) => {
    setAppointments(appointments.map(apt => 
      apt.id === id ? { ...apt, status: 'cancelled' as const } : apt
    ));
    toast({
      title: 'Rendez-vous annulé',
      description: 'Le rendez-vous a été annulé avec succès.'
    });
  };

  const upcomingAppointments = appointments.filter(
    apt => apt.status !== 'completed' && apt.status !== 'cancelled'
  );
  const pastAppointments = appointments.filter(
    apt => apt.status === 'completed' || apt.status === 'cancelled'
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Mon espace patient</h1>
          <p className="text-muted-foreground">Gérez vos rendez-vous et consultations</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rendez-vous à venir</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingAppointments.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">En attente</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {appointments.filter(apt => apt.status === 'pending').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Consultations totales</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{appointments.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Mes rendez-vous</h2>
          <NewAppointmentDialog onSubmit={handleNewAppointment} />
        </div>

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList>
            <TabsTrigger value="upcoming">À venir</TabsTrigger>
            <TabsTrigger value="past">Historique</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingAppointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">Aucun rendez-vous à venir</p>
                  <NewAppointmentDialog onSubmit={handleNewAppointment} />
                </CardContent>
              </Card>
            ) : (
              <>
                {upcomingAppointments.map(appointment => (
                  <div key={appointment.id} className="space-y-4">
                    <AppointmentCard
                      appointment={appointment}
                      userRole="patient"
                      onCancel={handleCancel}
                    />
                    {appointment.status === 'confirmed' && (
                      <GPSTracking appointment={appointment} />
                    )}
                  </div>
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastAppointments.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Aucun rendez-vous passé</p>
                </CardContent>
              </Card>
            ) : (
              pastAppointments.map(appointment => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  userRole="patient"
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
