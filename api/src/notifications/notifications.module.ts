import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config.module';
import { EmailService } from './email.service';
import { InAppNotificationsService } from './in-app-notifications.service';
import { SmsService } from './sms.service';
import { FakeOtpProvider, OTP_PROVIDER, TwilioVerifyProvider } from './otp.provider';

@Global()
@Module({
  providers: [
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
  exports: [EmailService, SmsService, InAppNotificationsService, OTP_PROVIDER, FakeOtpProvider],
})
export class NotificationsModule {}
