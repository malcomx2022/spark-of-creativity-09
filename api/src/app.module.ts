import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { KycModule } from './kyc/kyc.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { PractitionersModule } from './practitioners/practitioners.module';
import { ProfilesModule } from './profiles/profiles.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [ConfigModule, DatabaseModule, NotificationsModule, StorageModule, AuthModule, ProfilesModule, FilesModule, PractitionersModule, KycModule, PaymentsModule, AppointmentsModule, JobsModule, HealthModule],
})
export class AppModule {}
