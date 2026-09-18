import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY');
    const fedapayPublicKey = Deno.env.get('FEDAPAY_PUBLIC_KEY');

    const apiUrl = fedapayMode === 'live'
      ? 'https://api.fedapay.com'
      : 'https://sandbox-api.fedapay.com';

    const checkoutUrl = fedapayMode === 'live'
      ? 'https://checkout.fedapay.com'
      : 'https://fedapay-sandbox-checkout.fedapay.com';

    const results: any = {
      timestamp: new Date().toISOString(),
      environment: fedapayMode,
      configuration: {
        has_public_key: !!fedapayPublicKey,
        has_secret_key: !!fedapaySecretKey,
        public_key_format: fedapayPublicKey ?
          (fedapayPublicKey.startsWith('pk_sandbox_') ? 'sandbox' :
           fedapayPublicKey.startsWith('pk_live_') ? 'live' : 'invalid') : null,
        secret_key_format: fedapaySecretKey ?
          (fedapaySecretKey.startsWith('sk_sandbox_') ? 'sandbox' :
           fedapaySecretKey.startsWith('sk_live_') ? 'live' : 'invalid') : null,
      },
      connectivity: {
        api: { url: apiUrl, status: 'unknown', error: null },
        checkout: { url: checkoutUrl, status: 'unknown', error: null },
        cdn: { url: 'https://cdn.fedapay.com/checkout.js', status: 'unknown', error: null },
      },
    };

    // Test 1: API endpoint
    try {
      console.log('Testing API connectivity:', apiUrl);
      const apiResponse = await fetch(`${apiUrl}/v1/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      results.connectivity.api.status = apiResponse.ok ? 'reachable' : 'error';
      results.connectivity.api.http_status = apiResponse.status;

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        results.connectivity.api.error = errorText;
      }
    } catch (error) {
      results.connectivity.api.status = 'unreachable';
      results.connectivity.api.error = (error as Error).message;
    }

    // Test 2: Checkout domain (just check if we can resolve it)
    try {
      console.log('Testing Checkout domain:', checkoutUrl);
      const checkoutResponse = await fetch(checkoutUrl, {
        method: 'HEAD',
        redirect: 'manual',
      });

      results.connectivity.checkout.status = checkoutResponse.status < 500 ? 'reachable' : 'error';
      results.connectivity.checkout.http_status = checkoutResponse.status;
    } catch (error) {
      results.connectivity.checkout.status = 'unreachable';
      results.connectivity.checkout.error = (error as Error).message;
    }

    // Test 3: CDN
    try {
      console.log('Testing CDN:', 'https://cdn.fedapay.com/checkout.js');
      const cdnResponse = await fetch('https://cdn.fedapay.com/checkout.js?v=1.1.7', {
        method: 'HEAD',
      });

      results.connectivity.cdn.status = cdnResponse.ok ? 'reachable' : 'error';
      results.connectivity.cdn.http_status = cdnResponse.status;
    } catch (error) {
      results.connectivity.cdn.status = 'unreachable';
      results.connectivity.cdn.error = (error as Error).message;
    }

    // Test 4: Create a test transaction to verify API keys
    if (fedapaySecretKey) {
      try {
        console.log('Testing transaction creation...');
        const testResponse = await fetch(`${apiUrl}/v1/transactions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${fedapaySecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: 'Test connectivity',
            amount: 100,
            currency: { iso: 'XOF' },
            customer: {
              firstname: 'Test',
              lastname: 'User',
              email: 'test@example.com',
            },
          }),
        });

        results.api_test = {
          status: testResponse.ok ? 'success' : 'error',
          http_status: testResponse.status,
        };

        if (!testResponse.ok) {
          const errorData = await testResponse.json();
          results.api_test.error = errorData;
        } else {
          const successData = await testResponse.json();
          results.api_test.transaction_created = true;
          results.api_test.transaction_id = successData.v1_transaction?.id || successData['v1/transaction']?.id;
        }
      } catch (error) {
        results.api_test = {
          status: 'error',
          error: (error as Error).message,
        };
      }
    }

    // Analysis and recommendations
    results.analysis = {
      issues: [],
      recommendations: [],
    };

    if (!fedapayPublicKey || !fedapaySecretKey) {
      results.analysis.issues.push('Missing FedaPay API keys');
      results.analysis.recommendations.push('Configure FEDAPAY_PUBLIC_KEY and FEDAPAY_SECRET_KEY in environment variables');
    }

    if (results.configuration.public_key_format === 'invalid' || results.configuration.secret_key_format === 'invalid') {
      results.analysis.issues.push('Invalid API key format');
      results.analysis.recommendations.push('Verify that API keys start with pk_sandbox_, sk_sandbox_, pk_live_, or sk_live_');
    }

    if (results.configuration.public_key_format !== results.configuration.secret_key_format) {
      results.analysis.issues.push('API key environment mismatch');
      results.analysis.recommendations.push('Public and secret keys should both be for the same environment (sandbox or live)');
    }

    if (results.connectivity.api.status === 'unreachable') {
      results.analysis.issues.push('Cannot reach FedaPay API');
      results.analysis.recommendations.push('Check network connectivity and firewall rules');
    }

    if (results.connectivity.checkout.status === 'unreachable') {
      results.analysis.issues.push('Cannot reach FedaPay Checkout domain');
      results.analysis.recommendations.push('The checkout widget may not work. Check DNS resolution and network access to ' + checkoutUrl);
    }

    if (results.connectivity.cdn.status === 'unreachable') {
      results.analysis.issues.push('Cannot reach FedaPay CDN');
      results.analysis.recommendations.push('The FedaPay widget script cannot be loaded. Check network access to cdn.fedapay.com');
    }

    if (results.api_test?.status === 'error' && results.api_test?.http_status === 401) {
      results.analysis.issues.push('API authentication failed');
      results.analysis.recommendations.push('Verify that FEDAPAY_SECRET_KEY is correct and valid');
    }

    results.overall_status = results.analysis.issues.length === 0 ? 'healthy' : 'issues_detected';

    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Test error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
        stack: (error as Error).stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
