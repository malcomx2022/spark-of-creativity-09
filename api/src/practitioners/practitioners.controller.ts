import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  AvailabilityDto, availabilitySchema, AvailabilityUpdateDto, availabilityUpdateSchema, AvailableQuery, availableQuerySchema,
  ExceptionDto, exceptionSchema, ListPractitionersQuery, listPractitionersQuerySchema, RateDto, rateSchema, RateUpdateDto, rateUpdateSchema,
  RegisterPractitionerDto, registerPractitionerSchema, UpdatePractitionerDto, updatePractitionerSchema,
} from './practitioners.dto';
import { PractitionersService } from './practitioners.service';
import { ScheduleService } from './schedule.service';

@ApiTags('practitioners')
@Controller('practitioners')
export class PractitionersController {
  constructor(private readonly practitioners: PractitionersService, private readonly schedule: ScheduleService) {}

  // --- Public ---
  @Get()
  @ApiOperation({ summary: 'Liste publique des praticiens validés (ex get_public_practitioners)' })
  list(@Query(new ZodValidationPipe(listPractitionersQuerySchema)) q: ListPractitionersQuery) {
    return this.practitioners.listPublic(q);
  }

  @Get('available')
  @ApiOperation({ summary: 'Praticiens disponibles autour d’un point à une date/heure (ex find-available-practitioner)' })
  available(@Query(new ZodValidationPipe(availableQuerySchema)) q: AvailableQuery) {
    return this.practitioners.findAvailable(q);
  }

  // --- Espace praticien (déclaré avant :id pour la priorité de route) ---
  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscription praticien/coach atomique avec documents KYC (ex create-practitioner-account)' })
  register(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(registerPractitionerSchema)) dto: RegisterPractitionerDto) {
    return this.practitioners.register(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.practitioners.getOwn(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(updatePractitionerSchema)) dto: UpdatePractitionerDto) {
    return this.practitioners.updateOwn(user.id, dto);
  }

  @Post('me/availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async addAvailability(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(availabilitySchema)) dto: AvailabilityDto) {
    return this.schedule.addAvailability(user.id, await this.practitioners.requireOwnId(user.id), dto);
  }

  @Patch('me/availability/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updateAvailability(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(availabilityUpdateSchema)) dto: AvailabilityUpdateDto) {
    return this.schedule.updateAvailability(user.id, await this.practitioners.requireOwnId(user.id), id, dto);
  }

  @Delete('me/availability/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async deleteAvailability(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.deleteAvailability(user.id, await this.practitioners.requireOwnId(user.id), id);
  }

  @Post('me/exceptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async addException(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(exceptionSchema)) dto: ExceptionDto) {
    return this.schedule.addException(user.id, await this.practitioners.requireOwnId(user.id), dto);
  }

  @Delete('me/exceptions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async deleteException(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.deleteException(user.id, await this.practitioners.requireOwnId(user.id), id);
  }

  @Post('me/rates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async addRate(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(rateSchema)) dto: RateDto) {
    return this.schedule.addRate(user.id, await this.practitioners.requireOwnId(user.id), dto);
  }

  @Patch('me/rates/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updateRate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(rateUpdateSchema)) dto: RateUpdateDto) {
    return this.schedule.updateRate(user.id, await this.practitioners.requireOwnId(user.id), id, dto);
  }

  @Delete('me/rates/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async deleteRate(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.deleteRate(user.id, await this.practitioners.requireOwnId(user.id), id);
  }

  // --- Public, par identifiant ---
  @Get(':id')
  getPublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.practitioners.getPublic(id);
  }

  @Get(':id/availability')
  listAvailability(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.listAvailability(id);
  }

  @Get(':id/exceptions')
  listExceptions(@Param('id', ParseUUIDPipe) id: string, @Query('from') from?: string) {
    return this.schedule.listExceptions(id, from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined);
  }

  @Get(':id/rates')
  listRates(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.listRates(id);
  }
}
