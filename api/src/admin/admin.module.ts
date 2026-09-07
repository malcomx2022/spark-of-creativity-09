import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { AdminController, PublicStatsController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, ReviewsModule],
  controllers: [PublicStatsController, AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
