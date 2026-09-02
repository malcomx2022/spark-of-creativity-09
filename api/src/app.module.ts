import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AdminRolesGuard } from './common/guards/admin-roles.guard';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [ConfigModule, DatabaseModule, NotificationsModule, AuthModule, ProfilesModule, HealthModule],
  providers: [{ provide: APP_GUARD, useClass: AdminRolesGuard }],
})
export class AppModule {}
