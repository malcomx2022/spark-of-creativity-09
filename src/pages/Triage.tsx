import Header from '@/components/Header';
import { TriageForm } from '@/components/TriageForm';

export default function Triage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Triage Médical
          </h1>
          <p className="text-muted-foreground text-lg">
            Système d'évaluation d'urgence avec scoring automatique
          </p>
        </div>
        
        <TriageForm />
      </main>
    </div>
  );
}
