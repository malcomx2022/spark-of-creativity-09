import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { api, errorMessage } from '@/lib/api';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    website: '',
  });
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setSubmissionError('');
    setSubmissionSuccess(false);
    try {
      const result = await api.post<{ accepted: boolean }>('/contact', formData, { auth: false });
      if (!result.accepted) throw new Error('Votre message n’a pas été accepté.');
      setSubmissionSuccess(true);
      toast({ title: 'Message transmis', description: 'Votre demande a été transmise à notre équipe.' });
      setFormData({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
    } catch (error) {
      setSubmissionError(errorMessage(error, 'Votre message n’a pas pu être transmis. Réessayez plus tard.'));
    } finally {
      setIsSending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 overflow-hidden">
      <Header />
      
      <main className="container mx-auto px-4 sm:px-6 pt-24 pb-12 md:pb-16">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Contactez-nous
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Notre équipe est à votre disposition pour répondre à toutes vos questions
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          <Card>
            <CardHeader>
              <div className="w-12 h-12 gradient-primary rounded-lg flex items-center justify-center mb-4">
                <Phone className="h-6 w-6 text-white" />
              </div>
              <CardTitle>Téléphone</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-2">Ligne d'urgence 24h/24</p>
              <a href="tel:+22997123456" className="text-primary font-semibold hover:underline">
                +229 97 12 34 56
              </a>
              <p className="text-muted-foreground mt-4 mb-2">Service client</p>
              <a href="tel:+22996789012" className="text-primary font-semibold hover:underline">
                +229 96 78 90 12
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 gradient-primary rounded-lg flex items-center justify-center mb-4">
                <Mail className="h-6 w-6 text-white" />
              </div>
              <CardTitle>Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-2">Support général</p>
              <a href="mailto:support@domicares.com" className="text-primary font-semibold hover:underline">
                support@domicares.com
              </a>
              <p className="text-muted-foreground mt-4 mb-2">Partenariats</p>
              <a href="mailto:partenaires@domicares.com" className="text-primary font-semibold hover:underline">
                partenaires@domicares.com
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="w-12 h-12 gradient-primary rounded-lg flex items-center justify-center mb-4">
                <MapPin className="h-6 w-6 text-white" />
              </div>
              <CardTitle>Adresse</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                DomiCares<br />
                Haie Vive, Avenue Jean-Paul II<br />
                Cotonou, Bénin
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Horaires d'ouverture</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <p className="font-semibold">Service d'urgence</p>
                    <p className="text-muted-foreground">24h/24 - 7j/7</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <p className="font-semibold">Service client</p>
                    <p className="text-muted-foreground">Lundi - Vendredi : 8h00 - 20h00</p>
                    <p className="text-muted-foreground">Samedi - Dimanche : 9h00 - 18h00</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <p className="font-semibold">Consultations à domicile</p>
                    <p className="text-muted-foreground">Tous les jours : 7h00 - 22h00</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Envoyez-nous un message</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <fieldset disabled={isSending} className="space-y-4">
                <div hidden aria-hidden="true"><label htmlFor="website">Site web</label><input id="website" name="website" value={formData.website} onChange={handleChange} tabIndex={-1} autoComplete="off" /></div>
                {submissionError && <p role="alert">{submissionError}</p>}
                {submissionSuccess && <p role="status">Votre message a été transmis à notre équipe.</p>}
                <div>
                  <Label htmlFor="name">Nom complet</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    maxLength={254}
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    maxLength={40}
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <Label htmlFor="subject">Sujet</Label>
                  <Input
                    id="subject"
                    minLength={2}
                    maxLength={150}
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    minLength={10}
                    maxLength={5000}
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    rows={4}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSending}>
                  {isSending ? 'Envoi en cours…' : 'Envoyer le message'}
                </Button>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
