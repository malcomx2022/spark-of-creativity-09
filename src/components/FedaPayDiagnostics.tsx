import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isFedaPayLoaded } from '@/lib/fedapay-widget';

interface DiagnosticResult {
  timestamp: string;
  environment: string;
  configuration: {
    has_public_key: boolean;
    has_secret_key: boolean;
    public_key_format: string | null;
    secret_key_format: string | null;
  };
  connectivity: {
    api: { url: string; status: string; error: string | null };
    checkout: { url: string; status: string; error: string | null };
    cdn: { url: string; status: string; error: string | null };
  };
  overall_status: string;
  analysis: {
    issues: string[];
    recommendations: string[];
  };
}

export function FedaPayDiagnostics() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      // Check if FedaPay script is loaded
      const scriptLoaded = isFedaPayLoaded();
      console.log('FedaPay script loaded:', scriptLoaded);

      if (!scriptLoaded) {
        setError('Le script FedaPay n\'est pas chargé dans le navigateur. Vérifiez que <script src="https://cdn.fedapay.com/checkout.js"> est présent dans index.html');
        setIsRunning(false);
        return;
      }

      // Call backend diagnostic function
      const { data, error: invokeError } = await supabase.functions.invoke('test-fedapay-connectivity');

      if (invokeError) {
        throw invokeError;
      }

      setResult(data as DiagnosticResult);
    } catch (err) {
      console.error('Diagnostic error:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'reachable':
      case 'success':
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
      case 'issues_detected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'unreachable':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Diagnostic FedaPay</CardTitle>
        <CardDescription>
          Vérifiez la connectivité et la configuration de FedaPay
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runDiagnostics} disabled={isRunning}>
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Test en cours...
            </>
          ) : (
            'Lancer le diagnostic'
          )}
        </Button>

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-4">
            <Alert variant={result.overall_status === 'healthy' ? 'default' : 'destructive'}>
              {getStatusIcon(result.overall_status)}
              <AlertTitle>
                {result.overall_status === 'healthy' ? 'Tout fonctionne ✅' : 'Problèmes détectés ⚠️'}
              </AlertTitle>
              <AlertDescription>
                Environnement: <strong>{result.environment}</strong>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h3 className="font-semibold">Configuration</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.configuration.has_public_key ? 'success' : 'error')}
                  <span>Clé publique</span>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.configuration.has_secret_key ? 'success' : 'error')}
                  <span>Clé secrète</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Connectivité</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(result.connectivity.api.status)}
                    <span>API FedaPay</span>
                  </div>
                  <code className="text-xs text-muted-foreground">{result.connectivity.api.url}</code>
                </div>
                {result.connectivity.api.error && (
                  <p className="text-xs text-red-500 ml-7">{result.connectivity.api.error}</p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(result.connectivity.checkout.status)}
                    <span>Checkout</span>
                  </div>
                  <code className="text-xs text-muted-foreground">{result.connectivity.checkout.url}</code>
                </div>
                {result.connectivity.checkout.error && (
                  <p className="text-xs text-red-500 ml-7">{result.connectivity.checkout.error}</p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(result.connectivity.cdn.status)}
                    <span>CDN</span>
                  </div>
                  <code className="text-xs text-muted-foreground">{result.connectivity.cdn.url}</code>
                </div>
                {result.connectivity.cdn.error && (
                  <p className="text-xs text-red-500 ml-7">{result.connectivity.cdn.error}</p>
                )}
              </div>
            </div>

            {result.analysis.issues.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-red-600">Problèmes identifiés</h3>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {result.analysis.issues.map((issue, i) => (
                    <li key={i} className="text-red-600">{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.analysis.recommendations.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-orange-600">Recommandations</h3>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {result.analysis.recommendations.map((rec, i) => (
                    <li key={i} className="text-orange-600">{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer font-semibold">Détails techniques</summary>
              <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
