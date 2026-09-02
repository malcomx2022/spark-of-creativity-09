/**
 * Worker Domicares — point d'entrée `node dist/worker.js` (service `worker` du docker-compose).
 *
 * 1. Relais des notifications PostgreSQL émises par db/native/110_realtime_notify.sql
 *    (canal `table_changes`) vers un bus applicatif (futurs abonnés Socket.IO).
 * 2. Ordonnanceur des jobs (JobsService) : remplace les Edge Functions planifiées.
 *    Chaque exécution prend un verrou consultatif PostgreSQL : plusieurs workers
 *    peuvent tourner sans doublon.
 */
import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/config.module';
import { JobsService } from './jobs/jobs.service';

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

export function startScheduler(jobs: JobsService, logger = new Logger('Scheduler')): NodeJS.Timeout[] {
  return jobs.definitions.map((def) => {
    const tick = () => jobs.run(def.name).then((r) => logger.log(`${def.name}: ${JSON.stringify(r)}`)).catch((err) => logger.error(`${def.name}: ${err instanceof Error ? err.message : err}`));
    setTimeout(tick, 5_000);
    return setInterval(tick, def.everyMs);
  });
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const config = app.get<AppConfig>(APP_CONFIG);
  await startChangeListener(config.DATABASE_URL);
  console.log('[worker] à l’écoute du canal table_changes');
  changeBus.on('change', (e: TableChangeEvent) => console.log(`[worker] ${e.op} ${e.table} ${e.id ?? ''}`));
  if (config.JOBS_ENABLED) {
    startScheduler(app.get(JobsService));
    console.log('[worker] ordonnanceur démarré');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[worker] démarrage impossible', err);
    process.exit(1);
  });
}
