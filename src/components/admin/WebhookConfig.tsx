import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function WebhookConfig() {
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchWebhookUrl();
  }, []);

  const fetchWebhookUrl = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-webhook-url');
      if (error) throw error;
      setWebhookUrl(data.webhookUrl);
    } catch (error) {
      console.error('Error fetching webhook URL:', error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast({
        title: 'URL copiée',
        description: 'L\'URL du webhook a été copiée dans le presse-papiers',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de copier l\'URL',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration Webhook FedaPay</CardTitle>
        <CardDescription>
          URL à configurer dans votre dashboard FedaPay pour recevoir les notifications de paiement
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="space-y-2">
            <div><strong>Important:</strong> Sans cette configuration, les paiements ne seront pas confirmés automatiquement.</div>
            <div className="text-xs mt-2">
              <strong>⚠️ Mode Sandbox:</strong> Les paiements test doivent être approuvés manuellement dans le dashboard FedaPay 
              ou via l'outil de simulation admin. En production, FedaPay envoie automatiquement les webhooks d'approbation.
            </div>
          </AlertDescription>
        </Alert>

        {webhookUrl && (
          <>
            <div className="flex gap-2">
              <div className="flex-1 bg-muted p-3 rounded-md font-mono text-sm break-all">
                {webhookUrl}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={copyToClipboard}
                className="shrink-0"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Étapes de configuration:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Copiez l'URL ci-dessus</li>
                <li>Connectez-vous à votre <a href="https://dashboard.fedapay.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                  dashboard FedaPay <ExternalLink className="h-3 w-3" />
                </a></li>
                <li>Allez dans <strong>Paramètres → Webhooks</strong></li>
                <li>Cliquez sur <strong>Ajouter un webhook</strong></li>
                <li>Collez l'URL copiée</li>
                <li>Sélectionnez les événements:
                  <ul className="list-disc list-inside ml-6 mt-1">
                    <li><code>transaction.approved</code></li>
                    <li><code>transaction.declined</code></li>
                    <li><code>transaction.canceled</code></li>
                  </ul>
                </li>
                <li>Enregistrez la configuration</li>
              </ol>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                💡 <strong>Astuce:</strong> Testez votre webhook après configuration en effectuant un paiement test.
              </AlertDescription>
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
