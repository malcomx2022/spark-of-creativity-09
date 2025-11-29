import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupResult {
  payment_id: string;
  action: 'canceled' | 'synced' | 'failed';
  reason: string;
  old_status: string;
  new_status?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧹 Starting cleanup of stuck payments...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const fedapaySecretKey = Deno.env.get('FEDAPAY_SECRET_KEY')!;
    const fedapayMode = Deno.env.get('FEDAPAY_MODE') || 'sandbox';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse options from request body
    const body = await req.json();
    const options = {
      dryRun: body.dryRun ?? false,
      expirationMinutes: body.expirationMinutes ?? 10, // Default 10 minutes
      autoSync: body.autoSync ?? true,
    };

    console.log('Options:', options);

    const expirationThreshold = new Date(Date.now() - options.expirationMinutes * 60 * 1000);

    // Trouver tous les paiements bloqués
    const { data: stuckPayments, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .in('status', ['initiated', 'pending'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      throw fetchError;
    }

    if (!stuckPayments || stuckPayments.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stuck payments found',
          dry_run: options.dryRun,
          results: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${stuckPayments.length} stuck payments`);

    const fedapayApiUrl = fedapayMode === 'live'
      ? 'https://api.fedapay.com/v1/transactions'
      : 'https://sandbox-api.fedapay.com/v1/transactions';

    const results: CleanupResult[] = [];

    for (const payment of stuckPayments) {
      const createdAt = new Date(payment.created_at);
      const isExpired = createdAt < expirationThreshold;

      try {
        // CAS 1: Paiement sans transaction ID (création échouée)
        if (!payment.fedapay_transaction_id) {
          console.log(`Payment ${payment.id} has no transaction ID, canceling...`);

          if (!options.dryRun) {
            // Récupérer le practitioner_id
            const { data: appointment } = await supabase
              .from('appointments')
              .select('practitioner_id')
              .eq('id', payment.appointment_id)
              .single();

            if (appointment && payment.net_amount) {
              await supabase.rpc('update_payment_with_balance', {
                p_payment_id: payment.id,
                p_practitioner_id: appointment.practitioner_id,
                p_net_amount: payment.net_amount,
                p_new_status: 'canceled',
                p_new_payout_status: 'failed',
                p_hold_until: null,
              });
            } else {
              await supabase
                .from('payments')
                .update({
                  status: 'canceled',
                  payout_status: 'failed',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', payment.id);
            }

            // Remettre l'appointment en confirmed
            await supabase
              .from('appointments')
              .update({
                status: 'confirmed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', payment.appointment_id);
          }

          results.push({
            payment_id: payment.id,
            action: 'canceled',
            reason: 'No FedaPay transaction ID',
            old_status: payment.status,
            new_status: 'canceled',
          });
          continue;
        }

        // CAS 2: Paiement sans URL (génération de token échouée)
        if (!payment.fedapay_payment_url) {
          console.log(`Payment ${payment.id} has no payment URL, canceling...`);

          if (!options.dryRun) {
            const { data: appointment } = await supabase
              .from('appointments')
              .select('practitioner_id')
              .eq('id', payment.appointment_id)
              .single();

            if (appointment && payment.net_amount) {
              await supabase.rpc('update_payment_with_balance', {
                p_payment_id: payment.id,
                p_practitioner_id: appointment.practitioner_id,
                p_net_amount: payment.net_amount,
                p_new_status: 'canceled',
                p_new_payout_status: 'failed',
                p_hold_until: null,
              });
            } else {
              await supabase
                .from('payments')
                .update({
                  status: 'canceled',
                  payout_status: 'failed',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', payment.id);
            }

            await supabase
              .from('appointments')
              .update({
                status: 'confirmed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', payment.appointment_id);
          }

          results.push({
            payment_id: payment.id,
            action: 'canceled',
            reason: 'No payment URL',
            old_status: payment.status,
            new_status: 'canceled',
          });
          continue;
        }

        // CAS 3: Paiement expiré (>10 minutes)
        if (isExpired) {
          console.log(`Payment ${payment.id} expired, checking FedaPay status before canceling...`);

          // Vérifier d'abord le statut sur FedaPay
          let shouldCancel = true;

          if (options.autoSync) {
            try {
              const fedapayResponse = await fetch(
                `${fedapayApiUrl}/${payment.fedapay_transaction_id}`,
                {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${fedapaySecretKey}`,
                    'Content-Type': 'application/json',
                  },
                }
              );

              if (fedapayResponse.ok) {
                const fedapayData = await fedapayResponse.json();
                const fedapayTransaction = fedapayData.v1?.transaction || fedapayData;

                // Si le paiement a été approuvé sur FedaPay, synchroniser au lieu d'annuler
                if (fedapayTransaction.status === 'approved') {
                  shouldCancel = false;

                  console.log(`Payment ${payment.id} is approved on FedaPay, syncing...`);

                  if (!options.dryRun) {
                    const { data: appointment } = await supabase
                      .from('appointments')
                      .select('practitioner_id')
                      .eq('id', payment.appointment_id)
                      .single();

                    if (appointment) {
                      const holdUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

                      await supabase.rpc('update_payment_with_balance', {
                        p_payment_id: payment.id,
                        p_practitioner_id: appointment.practitioner_id,
                        p_net_amount: payment.net_amount || payment.amount,
                        p_new_status: 'paid',
                        p_new_payout_status: 'held',
                        p_hold_until: holdUntil,
                      });

                      await supabase
                        .from('appointments')
                        .update({
                          status: 'confirmed',
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', payment.appointment_id);
                    }
                  }

                  results.push({
                    payment_id: payment.id,
                    action: 'synced',
                    reason: 'Approved on FedaPay but not synced',
                    old_status: payment.status,
                    new_status: 'paid',
                  });
                  continue;
                }
              }
            } catch (error) {
              console.error(`Error checking FedaPay status for ${payment.id}:`, error);
            }
          }

          // Si pas approuvé ou si auto-sync désactivé, annuler
          if (shouldCancel) {
            if (!options.dryRun) {
              const { data: appointment } = await supabase
                .from('appointments')
                .select('practitioner_id')
                .eq('id', payment.appointment_id)
                .single();

              if (appointment && payment.net_amount) {
                await supabase.rpc('update_payment_with_balance', {
                  p_payment_id: payment.id,
                  p_practitioner_id: appointment.practitioner_id,
                  p_net_amount: payment.net_amount,
                  p_new_status: 'canceled',
                  p_new_payout_status: 'failed',
                  p_hold_until: null,
                });
              } else {
                await supabase
                  .from('payments')
                  .update({
                    status: 'canceled',
                    payout_status: 'failed',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', payment.id);
              }

              await supabase
                .from('appointments')
                .update({
                  status: 'confirmed',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', payment.appointment_id);
            }

            results.push({
              payment_id: payment.id,
              action: 'canceled',
              reason: `Expired (${Math.floor((Date.now() - createdAt.getTime()) / 60000)} minutes old)`,
              old_status: payment.status,
              new_status: 'canceled',
            });
          }
        } else {
          // CAS 4: Paiement récent mais potentiellement bloqué - vérifier FedaPay
          if (options.autoSync) {
            try {
              const fedapayResponse = await fetch(
                `${fedapayApiUrl}/${payment.fedapay_transaction_id}`,
                {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${fedapaySecretKey}`,
                    'Content-Type': 'application/json',
                  },
                }
              );

              if (fedapayResponse.ok) {
                const fedapayData = await fedapayResponse.json();
                const fedapayTransaction = fedapayData.v1?.transaction || fedapayData;

                const statusMap: Record<string, string> = {
                  'approved': 'paid',
                  'declined': 'failed',
                  'canceled': 'canceled',
                };

                const newStatus = statusMap[fedapayTransaction.status];

                if (newStatus && newStatus !== payment.status) {
                  console.log(`Payment ${payment.id} status changed on FedaPay: ${fedapayTransaction.status}`);

                  if (!options.dryRun) {
                    const { data: appointment } = await supabase
                      .from('appointments')
                      .select('practitioner_id')
                      .eq('id', payment.appointment_id)
                      .single();

                    if (appointment) {
                      const payoutStatus = newStatus === 'paid' ? 'held' : 'failed';
                      const holdUntil = newStatus === 'paid'
                        ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
                        : null;

                      await supabase.rpc('update_payment_with_balance', {
                        p_payment_id: payment.id,
                        p_practitioner_id: appointment.practitioner_id,
                        p_net_amount: payment.net_amount || payment.amount,
                        p_new_status: newStatus,
                        p_new_payout_status: payoutStatus,
                        p_hold_until: holdUntil,
                      });

                      if (newStatus === 'paid') {
                        await supabase
                          .from('appointments')
                          .update({
                            status: 'confirmed',
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', payment.appointment_id);
                      }
                    }
                  }

                  results.push({
                    payment_id: payment.id,
                    action: 'synced',
                    reason: `Status changed on FedaPay: ${fedapayTransaction.status}`,
                    old_status: payment.status,
                    new_status: newStatus,
                  });
                }
              }
            } catch (error) {
              console.error(`Error syncing ${payment.id}:`, error);
              results.push({
                payment_id: payment.id,
                action: 'failed',
                reason: 'Error syncing with FedaPay',
                old_status: payment.status,
                error: (error as Error).message,
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error processing payment ${payment.id}:`, error);
        results.push({
          payment_id: payment.id,
          action: 'failed',
          reason: 'Error during cleanup',
          old_status: payment.status,
          error: (error as Error).message,
        });
      }
    }

    const summary = {
      total_processed: stuckPayments.length,
      canceled: results.filter(r => r.action === 'canceled').length,
      synced: results.filter(r => r.action === 'synced').length,
      failed: results.filter(r => r.action === 'failed').length,
    };

    console.log('🧹 Cleanup complete:', summary);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: options.dryRun,
        summary,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cleanup error:', error);
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
