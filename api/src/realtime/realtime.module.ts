import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagingModule } from '../messaging/messaging.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({ imports: [AuthModule, MessagingModule], providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
