/**
 * Worker Domicares — point d'entrée `node dist/worker.js` (service `worker` du docker-compose).
 *
 * Ordonnanceur des jobs (JobsService) : remplace les Edge Functions planifiées. Chaque
 * exécution prend un verrou consultatif PostgreSQL : plusieurs workers peuvent tourner
 * sans doublon. Le relais temps réel (LISTEN table_changes → Socket.IO) est assuré par
 * l'API (src/realtime), qui tient les connexions clientes.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/config.module';
import { JobsService } from './jobs/jobs.service';

export function startScheduler(jobs: JobsService, logger = new Logger('Scheduler')): NodeJS.Timeout[] {
  return jobs.definitions.map((def) => {
    const tick = () => jobs.run(def.name).then((r) => logger.log(`${def.name}: ${JSON.stringify(r)}`)).catch((err) => logger.error(`${def.name}: ${err instanceof Error ? err.message : err}`));
    setTimeout(tick, 5_000);
    return setInterval(tick, def.everyMs);
  });
}

async function main(): Promise<void> {
  process.env.REALTIME_ENABLED = 'false'; // le worker ne tient pas de sockets clients
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const config = app.get<AppConfig>(APP_CONFIG);
  if (!config.JOBS_ENABLED) {
    console.log('[worker] JOBS_ENABLED=false : rien à faire');
    return;
  }
  startScheduler(app.get(JobsService));
  console.log(`[worker] ordonnanceur démarré (${app.get(JobsService).definitions.map((d) => d.name).join(', ')})`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[worker] démarrage impossible', err);
    process.exit(1);
  });
}
