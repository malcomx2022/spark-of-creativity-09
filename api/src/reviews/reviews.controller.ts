import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReviewsService } from './reviews.service';

export const createReviewSchema = z.object({ appointmentId: z.string().min(1).max(255), rating: z.number().int().min(1, 'Note entre 1 et 5').max(5, 'Note entre 1 et 5'), comment: z.string().trim().max(2000).optional().nullable() });
const pageSchema = z.object({ page: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(50).default(10) });

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Évalue une consultation terminée (un avis par rendez-vous)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createReviewSchema)) dto: z.infer<typeof createReviewSchema>) {
    return this.reviews.create(user.id, dto);
  }

  @Get('reviews/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.reviews.listMine(user.id);
  }

  @Get('reviews/practitioner/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  forMe(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(pageSchema)) q: { page: number; limit: number }) {
    return this.reviews.forMe(user.id, q.page, q.limit);
  }

  @Get('practitioners/:id/reviews')
  @ApiOperation({ summary: 'Avis publics et statistiques d’un praticien (masqués exclus)' })
  forPractitioner(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(pageSchema)) q: { page: number; limit: number }) {
    return this.reviews.forPractitioner(id, q.page, q.limit);
  }
}
