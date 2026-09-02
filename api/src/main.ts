import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { APP_CONFIG, AppConfig } from './config/config.module';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT, '0.0.0.0');
  Logger.log(`API démarrée sur http://0.0.0.0:${config.PORT}/${config.API_PREFIX}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error(err instanceof Error ? err.stack ?? err.message : String(err), 'Bootstrap');
  process.exit(1);
});
