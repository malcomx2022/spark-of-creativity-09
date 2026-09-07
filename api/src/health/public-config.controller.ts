import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { DatabaseService, SERVICE_CONTEXT } from '../database/database.service';

/** Clés `system_config` lisibles publiquement (bannières de fonctionnalités de la page d'accueil). */
const PUBLIC_FEATURE_KEYS = ['feature_consultation_247', 'feature_geolocation', 'feature_mobile_money', 'feature_continuous_training'];

@ApiTags('config')
@Controller('config')
export class PublicConfigController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, private readonly database: DatabaseService) {}

  @Get('public')
  @ApiOperation({ summary: 'Configuration publique du front (ex get-mapbox-token + lecture anonyme de system_config)' })
  async publicConfig() {
    const rows = await this.database.runAs(SERVICE_CONTEXT, (trx) => trx.selectFrom('system_config').select(['key', 'value']).where('key', 'in', PUBLIC_FEATURE_KEYS).execute());
    const features: Record<string, boolean> = {};
    for (const r of rows) {
      const v = r.value as unknown;
      features[r.key] = typeof v === 'boolean' ? v : typeof v === 'object' && v !== null && 'enabled' in v ? Boolean((v as { enabled?: unknown }).enabled) : v === 'true';
    }
    return { mapboxToken: this.config.MAPBOX_TOKEN ?? null, features };
  }
}
