import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { FilesModule } from './files/files.module';
import { FinanceModule } from './finance/finance.module';
import { GroupSessionsModule } from './group-sessions/group-sessions.module';
import { KycModule } from './kyc/kyc.module';
import { MessagingModule } from './messaging/messaging.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { PractitionersModule } from './practitioners/practitioners.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [ConfigModule, DatabaseModule, AuditModule, NotificationsModule, StorageModule, AuthModule, ProfilesModule, FilesModule, PractitionersModule, KycModule, PaymentsModule, AppointmentsModule, GroupSessionsModule, FinanceModule, AdminModule, MessagingModule, RealtimeModule, JobsModule, HealthModule],
})
export class AppModule {}
