import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ConversationsQuery, conversationsQuerySchema, MessagesQuery, messagesQuerySchema, SendMessageDto, sendMessageSchema } from './messaging.dto';
import { MessagingService } from './messaging.service';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  @ApiOperation({ summary: 'Conversations (rendez-vous confirmés/terminés) avec dernier message et non-lus' })
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(conversationsQuerySchema)) q: ConversationsQuery) {
    return this.messaging.listConversations(user.id, q);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.messaging.unreadCount(user.id);
  }

  @Get(':appointmentId/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') appointmentId: string, @Query(new ZodValidationPipe(messagesQuerySchema)) q: MessagesQuery) {
    return this.messaging.listMessages(user.id, appointmentId, q);
  }

  @Get(':appointmentId')
  conversation(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId', ParseUUIDPipe) appointmentId: string) {
    return this.messaging.getConversation(user.id, appointmentId);
  }

  @Post(':appointmentId/messages')
  @ApiOperation({ summary: 'Envoie un message (pièce jointe via /files/upload-url, dossier message-attachments)' })
  send(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') appointmentId: string, @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto) {
    return this.messaging.send(user.id, appointmentId, dto);
  }

  @Post(':appointmentId/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('appointmentId') appointmentId: string) {
    return this.messaging.markRead(user.id, appointmentId);
  }
}
