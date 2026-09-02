/**
 * Worker Domicares — point d'entrée `node dist/worker.js` (service `worker` du docker-compose).
 *
 * Étape 1 : relais des notifications PostgreSQL émises par db/native/110_realtime_notify.sql
 * (canal `table_changes`) vers un bus applicatif. Les abonnés Socket.IO et les jobs BullMQ
 * (consultations.tick, payments.sync, relances…) se brancheront ici aux étapes suivantes.
 */
import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { Client } from 'pg';
import { loadConfig } from './config/config.schema';

export interface TableChangeEvent {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  id?: string;
  user_id?: string;
  patient_id?: string;
  practitioner_id?: string;
  appointment_id?: string;
  session_id?: string;
  status?: string;
  at: string;
}

export const changeBus = new EventEmitter();

export async function startChangeListener(databaseUrl: string): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  client.on('notification', (msg) => {
    if (msg.channel !== 'table_changes' || !msg.payload) return;
    try {
      const event = JSON.parse(msg.payload) as TableChangeEvent;
      changeBus.emit('change', event);
      changeBus.emit(`change:${event.table}`, event);
    } catch (err) {
      console.error('[worker] payload table_changes illisible', err);
    }
  });
  client.on('error', (err) => {
    console.error('[worker] connexion LISTEN perdue', err);
    process.exit(1); // le superviseur (docker restart: unless-stopped) relance le worker
  });
  await client.query('LISTEN table_changes');
  return client;
}

if (require.main === module) {
  const config = loadConfig();
  startChangeListener(config.DATABASE_URL)
    .then(() => {
      console.log('[worker] à l’écoute du canal table_changes');
      changeBus.on('change', (e: TableChangeEvent) => console.log(`[worker] ${e.op} ${e.table} ${e.id ?? ''}`));
    })
    .catch((err) => {
      console.error('[worker] démarrage impossible', err);
      process.exit(1);
    });
}
