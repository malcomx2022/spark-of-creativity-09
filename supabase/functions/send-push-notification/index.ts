import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  userId: string;
  title: string;
  message: string;
  url?: string;
  notificationId?: string;
}

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Helper to convert base64 to Uint8Array
function base64UrlToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ECDSA P-256 signing implementation
async function createJWT(vapidPublicKey: string, vapidPrivateKey: string, audience: string): Promise<string> {
  const header = {
    typ: 'JWT',
    alg: 'ES256',
  };

  const jwtPayload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 hours
    sub: Deno.env.get('WEB_PUSH_EMAIL') || 'mailto:notifications@app.com',
  };

  const encoder = new TextEncoder();
  const headerStr = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadStr = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const unsignedToken = `${headerStr}.${payloadStr}`;
  
  // Import private key
  const privateKeyBytes = base64UrlToUint8Array(vapidPrivateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes as unknown as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  // Convert signature to base64url
  const signatureArray = new Uint8Array(signature);
  const signatureStr = btoa(String.fromCharCode(...signatureArray))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${unsignedToken}.${signatureStr}`;
}

async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    
    // Create JWT token
    const jwt = await createJWT(vapidPublicKey, vapidPrivateKey, audience);

    // Prepare headers
    const headers: Record<string, string> = {
      'TTL': '86400', // 24 hours
      'Content-Type': 'application/octet-stream',
      'Authorization': `Bearer ${jwt}`,
      'Crypto-Key': `p256ecdsa=${vapidPublicKey}`,
    };

    // Send the push notification
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body: payload,
    });

    if (!response.ok) {
      console.error(`Push failed with status: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending web push:', error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { userId, title, message, url, notificationId }: PushPayload = await req.json();

    if (!userId || !title || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, title, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending push notification to user: ${userId}`);

    // Get user's push subscriptions
    const { data: subscriptions, error: fetchError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (fetchError) {
      console.error('Error fetching subscriptions:', fetchError);
      throw fetchError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found for user');
      return new Response(
        JSON.stringify({ message: 'No push subscriptions found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${subscriptions.length} subscription(s)`);

    // Get VAPID keys from environment
    const vapidPublicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY');

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('Missing VAPID keys');
      throw new Error('Missing VAPID configuration');
    }

    const payload = JSON.stringify({
      title,
      message,
      body: message,
      url: url || '/',
      notificationId,
      tag: 'notification',
    });

    let successCount = 0;
    const failedSubscriptions: string[] = [];

    // Send push notification to each subscription
    for (const subscription of subscriptions) {
      try {
        const success = await sendWebPush(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
          payload,
          vapidPublicKey,
          vapidPrivateKey
        );

        if (success) {
          console.log(`Push sent successfully to endpoint: ${subscription.endpoint.substring(0, 50)}...`);
          successCount++;
        } else {
          console.log('Failed to send push, removing subscription');
          failedSubscriptions.push(subscription.id);
          
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', subscription.id);
        }
      } catch (error: any) {
        console.error(`Failed to send push to ${subscription.endpoint}:`, error);
        failedSubscriptions.push(subscription.id);
      }
    }

    // Clean up failed subscriptions
    if (failedSubscriptions.length > 0) {
      console.log(`Removed ${failedSubscriptions.length} invalid subscription(s)`);
    }

    return new Response(
      JSON.stringify({ 
        message: 'Push notifications sent', 
        sent: successCount,
        total: subscriptions.length,
        failed: failedSubscriptions.length 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
