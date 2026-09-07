import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PaymentMethodsService, SavePaymentMethodDto, savePaymentMethodSchema } from './payment-methods.service';

@ApiTags('payment-methods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.methods.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistre un numéro Mobile Money (chiffré côté serveur, ex secure-phone + addPaymentMethod)' })
  save(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(savePaymentMethodSchema)) dto: SavePaymentMethodDto) {
    return this.methods.save(user.id, dto);
  }

  @Post(':id/default')
  @HttpCode(200)
  setDefault(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.methods.setDefault(user.id, id);
  }

  @Get(':id/phone')
  @ApiOperation({ summary: 'Numéro en clair pour préremplir le paiement (propriétaire uniquement, ex secure-phone decrypt)' })
  reveal(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.methods.reveal(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.methods.remove(user.id, id);
  }
}
