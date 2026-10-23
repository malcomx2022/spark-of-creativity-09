import { Module } from '@nestjs/common';
import { AcademyModule } from './academy/academy.module';
import { AdminModule } from './admin/admin.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DisputesModule } from './disputes/disputes.module';
import { FilesModule } from './files/files.module';
import { FinanceModule } from './finance/finance.module';
import { GroupSessionsModule } from './group-sessions/group-sessions.module';
import { KycModule } from './kyc/kyc.module';
import { MedicalModule } from './medical/medical.module';
import { MessagingModule } from './messaging/messaging.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PaymentsModule } from './payments/payments.module';
import { PractitionersModule } from './practitioners/practitioners.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StatsModule } from './stats/stats.module';
import { StorageModule } from './storage/storage.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [ConfigModule, DatabaseModule, AuditModule, NotificationsModule, StorageModule, AuthModule, ProfilesModule, FilesModule, PractitionersModule, KycModule, PaymentsModule, AppointmentsModule, GroupSessionsModule, FinanceModule, AdminModule, SupportModule, DisputesModule, MedicalModule, ReviewsModule, PaymentMethodsModule, StatsModule, MessagingModule, RealtimeModule, JobsModule, HealthModule, AcademyModule],
})
export class AppModule {}
