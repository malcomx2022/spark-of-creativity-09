import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ListNotificationsQuery, listNotificationsQuerySchema, PreferencesDto, preferencesSchema, PushSubscriptionDto, pushSubscriptionSchema, unsubscribeSchema } from './notifications.dto';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications (ex useNotifications, 50 dernières)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listNotificationsQuerySchema)) q: ListNotificationsQuery) {
    return this.notifications.list(user.id, q);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.remove(user.id, id);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Put('preferences')
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(preferencesSchema)) dto: PreferencesDto) {
    return this.notifications.updatePreferences(user.id, dto);
  }
}

@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly notifications: NotificationsService, private readonly push: PushService) {}

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Clé publique VAPID (remplace la constante en dur de src/lib/push-notifications.ts)' })
  vapid() {
    return { publicKey: this.push.publicKey };
  }

  @Post('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enregistre (upsert) un abonnement push du navigateur' })
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(pushSubscriptionSchema)) dto: PushSubscriptionDto, @Req() req: FastifyRequest) {
    return this.notifications.savePushSubscription(user.id, dto, dto.userAgent ?? req.headers['user-agent']);
  }

  @Delete('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(unsubscribeSchema)) dto: { endpoint: string }) {
    return this.notifications.removePushSubscription(user.id, dto.endpoint);
  }
}
