import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { triageQuestions, calculateTriageScore, type TriageResult } from '@/types/triage';
import { toast } from '@/hooks/use-toast';

const formSchema = z.object({
  consciousness: z.string().min(1, 'Veuillez sélectionner une option'),
  breathing: z.string().min(1, 'Veuillez sélectionner une option'),
  'chest-pain': z.string().min(1, 'Veuillez sélectionner une option'),
  bleeding: z.string().min(1, 'Veuillez sélectionner une option'),
  'pain-level': z.string().min(1, 'Veuillez sélectionner une option'),
  symptoms: z.array(z.string()).default([])
});

type FormValues = z.infer<typeof formSchema>;

export function TriageForm() {
  const [result, setResult] = useState<TriageResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      consciousness: '',
      breathing: '',
      'chest-pain': '',
      bleeding: '',
      'pain-level': '',
      symptoms: []
    }
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const triageResult = calculateTriageScore(data);
    setResult(triageResult);
    setIsSubmitting(false);

    toast({
      title: 'Évaluation terminée',
      description: triageResult.message
    });
  };

  const getUrgencyIcon = (level: string) => {
    switch (level) {
      case 'immediate':
        return <AlertCircle className="h-8 w-8 text-destructive" />;
      case 'urgent':
        return <AlertTriangle className="h-8 w-8 text-orange-500" />;
      case 'semi-urgent':
        return <Clock className="h-8 w-8 text-yellow-500" />;
      default:
        return <CheckCircle2 className="h-8 w-8 text-green-500" />;
    }
  };

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'immediate':
        return 'border-destructive bg-destructive/5';
      case 'urgent':
        return 'border-orange-500 bg-orange-500/5';
      case 'semi-urgent':
        return 'border-yellow-500 bg-yellow-500/5';
      default:
        return 'border-green-500 bg-green-500/5';
    }
  };

  if (result) {
    return (
      <Card className={`border-2 ${getUrgencyColor(result.urgencyLevel)}`}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getUrgencyIcon(result.urgencyLevel)}
          </div>
          <CardTitle className="text-2xl">{result.message}</CardTitle>
          <CardDescription>Score de triage: {result.score}/25</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3 text-lg">Recommandations:</h3>
            <ul className="space-y-2">
              {result.recommendations.map((rec, index) => (
                <li key={index} className="flex gap-2">
                  <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button 
              onClick={() => {
                setResult(null);
                form.reset();
              }}
              variant="outline"
              className="flex-1"
            >
              Nouvelle évaluation
            </Button>
            {result.urgencyLevel === 'immediate' && (
              <Button 
                onClick={() => window.location.href = 'tel:15'}
                variant="default"
                className="flex-1"
              >
                Appeler le 15
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Évaluation d'urgence médicale</CardTitle>
        <CardDescription>
          Répondez aux questions suivantes pour évaluer le niveau d'urgence
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {triageQuestions.map((question) => (
              <FormField
                key={question.id}
                control={form.control}
                name={question.id as keyof FormValues}
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-semibold">
                      {question.question}
                    </FormLabel>
                    <FormControl>
                      {question.type === 'radio' ? (
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value as string}
                          className="space-y-2"
                        >
                          {question.options.map((option) => (
                            <div key={option.value} className="flex items-center space-x-2">
                              <RadioGroupItem value={option.value} id={`${question.id}-${option.value}`} />
                              <label
                                htmlFor={`${question.id}-${option.value}`}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {option.label}
                              </label>
                            </div>
                          ))}
                        </RadioGroup>
                      ) : (
                        <div className="space-y-2">
                          {question.options.map((option) => (
                            <div key={option.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${question.id}-${option.value}`}
                                checked={(field.value as string[])?.includes(option.value)}
                                onCheckedChange={(checked) => {
                                  const currentValues = field.value as string[] || [];
                                  const newValues = checked
                                    ? [...currentValues, option.value]
                                    : currentValues.filter((v) => v !== option.value);
                                  field.onChange(newValues);
                                }}
                              />
                              <label
                                htmlFor={`${question.id}-${option.value}`}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {option.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Analyse en cours...' : 'Calculer le niveau d\'urgence'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
