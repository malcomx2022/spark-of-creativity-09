import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { DispatchService } from './dispatch.service';
import { EmailService } from './email.service';
import { InAppNotificationsService } from './in-app-notifications.service';
import { NotificationsController, PushController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { SmsService } from './sms.service';
import { FakeOtpProvider, OTP_PROVIDER, TwilioVerifyProvider } from './otp.provider';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, PushController],
  providers: [
    PushService,
    DispatchService,
    NotificationsService,
    EmailService,
    SmsService,
    InAppNotificationsService,
    FakeOtpProvider,
    TwilioVerifyProvider,
    {
      provide: OTP_PROVIDER,
      inject: [APP_CONFIG, FakeOtpProvider, TwilioVerifyProvider],
      useFactory: (config: AppConfig, fake: FakeOtpProvider, twilio: TwilioVerifyProvider) =>
        config.OTP_PROVIDER === 'twilio' ? twilio : fake,
    },
  ],
  exports: [EmailService, SmsService, InAppNotificationsService, PushService, DispatchService, NotificationsService, OTP_PROVIDER, FakeOtpProvider],
})
export class NotificationsModule {}
