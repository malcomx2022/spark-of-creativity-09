import { EventEmitter } from 'node:events';
import { Client } from 'pg';

/** Événement émis par db/native/110_realtime_notify.sql sur le canal `table_changes`. */
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

/** Connexion PostgreSQL dédiée en LISTEN ; `onError` est appelé si la connexion tombe. */
export async function startChangeListener(databaseUrl: string, bus: EventEmitter, onError: (err: Error) => void): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  client.on('notification', (msg) => {
    if (msg.channel !== 'table_changes' || !msg.payload) return;
    try {
      const event = JSON.parse(msg.payload) as TableChangeEvent;
      bus.emit('change', event);
      bus.emit(`change:${event.table}`, event);
    } catch (err) {
      console.error('[realtime] payload table_changes illisible', err);
    }
  });
  client.on('error', onError);
  await client.query('LISTEN table_changes');
  return client;
}
